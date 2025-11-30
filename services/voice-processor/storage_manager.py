"""
Storage Manager for Voice Recordings
Supports local filesystem and S3-compatible storage (AWS S3, MinIO, etc.)
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class StorageManager:
    """Manages voice recording storage with local and S3 support"""
    
    def __init__(self):
        self.storage_type = os.getenv('STORAGE_TYPE', 'local').lower()
        self.storage_path = os.getenv('STORAGE_PATH', '/app/data/voice-recordings')
        
        logger.info(f"Initializing StorageManager with type: {self.storage_type}")
        
        if self.storage_type == 's3':
            self._init_s3()
        elif self.storage_type == 'local':
            self._init_local()
        else:
            logger.warning(f"Unknown storage type '{self.storage_type}', defaulting to local")
            self.storage_type = 'local'
            self._init_local()
    
    def _init_s3(self):
        """Initialize S3 client"""
        self.s3_bucket = os.getenv('S3_BUCKET')
        if not self.s3_bucket:
            raise ValueError("S3_BUCKET environment variable required for S3 storage")
        
        # S3 client configuration
        s3_config = {
            'region_name': os.getenv('S3_REGION', 'us-east-1'),
        }
        
        # AWS credentials
        aws_access_key = os.getenv('S3_ACCESS_KEY_ID')
        aws_secret_key = os.getenv('S3_SECRET_ACCESS_KEY')
        
        if aws_access_key and aws_secret_key:
            s3_config['aws_access_key_id'] = aws_access_key
            s3_config['aws_secret_access_key'] = aws_secret_key
        
        # Custom endpoint (for MinIO or other S3-compatible services)
        s3_endpoint = os.getenv('S3_ENDPOINT')
        if s3_endpoint:
            s3_config['endpoint_url'] = s3_endpoint
            logger.info(f"Using custom S3 endpoint: {s3_endpoint}")
        
        try:
            self.s3_client = boto3.client('s3', **s3_config)
            # Test connection
            self.s3_client.head_bucket(Bucket=self.s3_bucket)
            logger.info(f"Successfully connected to S3 bucket: {self.s3_bucket}")
        except ClientError as e:
            logger.error(f"Failed to connect to S3: {e}")
            raise
    
    def _init_local(self):
        """Initialize local filesystem storage"""
        os.makedirs(self.storage_path, exist_ok=True)
        logger.info(f"Using local storage at: {self.storage_path}")
    
    def save_recording(self, file_data: bytes, filename: str, metadata: Optional[dict] = None) -> str:
        """
        Save voice recording to storage
        
        Args:
            file_data: Audio file bytes
            filename: Name of the file
            metadata: Optional metadata (transcription, duration, etc.)
        
        Returns:
            Storage path/key of saved file
        """
        # Generate timestamp-based path
        timestamp = datetime.utcnow()
        date_prefix = timestamp.strftime('%Y/%m/%d')
        storage_key = f"{date_prefix}/{filename}"
        
        try:
            if self.storage_type == 's3':
                # Upload to S3
                extra_args = {}
                
                # Add metadata if provided
                if metadata:
                    # S3 metadata must be strings
                    string_metadata = {k: str(v) for k, v in metadata.items()}
                    extra_args['Metadata'] = string_metadata
                
                # Set content type based on file extension
                ext = os.path.splitext(filename)[1].lower()
                content_types = {
                    '.mp3': 'audio/mpeg',
                    '.wav': 'audio/wav',
                    '.m4a': 'audio/mp4',
                    '.webm': 'audio/webm',
                    '.ogg': 'audio/ogg'
                }
                if ext in content_types:
                    extra_args['ContentType'] = content_types[ext]
                
                self.s3_client.put_object(
                    Bucket=self.s3_bucket,
                    Key=storage_key,
                    Body=file_data,
                    **extra_args
                )
                
                logger.info(f"Saved recording to S3: s3://{self.s3_bucket}/{storage_key}")
                return f"s3://{self.s3_bucket}/{storage_key}"
                
            else:  # local
                # Save to local filesystem
                full_path = os.path.join(self.storage_path, storage_key)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                
                with open(full_path, 'wb') as f:
                    f.write(file_data)
                
                # Save metadata as JSON sidecar file if provided
                if metadata:
                    import json
                    metadata_path = full_path + '.json'
                    with open(metadata_path, 'w') as f:
                        json.dump(metadata, f, indent=2)
                
                logger.info(f"Saved recording to local: {full_path}")
                return full_path
                
        except Exception as e:
            logger.error(f"Failed to save recording: {e}")
            raise
    
    def get_recording(self, storage_key: str) -> Optional[bytes]:
        """
        Retrieve voice recording from storage
        
        Args:
            storage_key: Storage path/key of the file
        
        Returns:
            File bytes or None if not found
        """
        try:
            if self.storage_type == 's3':
                # Parse S3 URL
                if storage_key.startswith('s3://'):
                    # Extract bucket and key from s3://bucket/key format
                    parts = storage_key[5:].split('/', 1)
                    bucket = parts[0]
                    key = parts[1] if len(parts) > 1 else ''
                else:
                    bucket = self.s3_bucket
                    key = storage_key
                
                response = self.s3_client.get_object(Bucket=bucket, Key=key)
                return response['Body'].read()
                
            else:  # local
                with open(storage_key, 'rb') as f:
                    return f.read()
                    
        except FileNotFoundError:
            logger.warning(f"Recording not found: {storage_key}")
            return None
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.warning(f"Recording not found in S3: {storage_key}")
                return None
            logger.error(f"Failed to retrieve recording: {e}")
            raise
        except Exception as e:
            logger.error(f"Failed to retrieve recording: {e}")
            raise
    
    def delete_recording(self, storage_key: str) -> bool:
        """
        Delete voice recording from storage
        
        Args:
            storage_key: Storage path/key of the file
        
        Returns:
            True if deleted successfully
        """
        try:
            if self.storage_type == 's3':
                # Parse S3 URL
                if storage_key.startswith('s3://'):
                    parts = storage_key[5:].split('/', 1)
                    bucket = parts[0]
                    key = parts[1] if len(parts) > 1 else ''
                else:
                    bucket = self.s3_bucket
                    key = storage_key
                
                self.s3_client.delete_object(Bucket=bucket, Key=key)
                logger.info(f"Deleted recording from S3: {storage_key}")
                
            else:  # local
                if os.path.exists(storage_key):
                    os.unlink(storage_key)
                    # Delete metadata file if exists
                    metadata_path = storage_key + '.json'
                    if os.path.exists(metadata_path):
                        os.unlink(metadata_path)
                    logger.info(f"Deleted recording from local: {storage_key}")
                else:
                    logger.warning(f"Recording not found for deletion: {storage_key}")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete recording: {e}")
            return False
    
    def cleanup_old_recordings(self, days: int = 90):
        """
        Delete recordings older than specified days
        
        Args:
            days: Number of days to retain recordings (default: 90)
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        logger.info(f"Cleaning up recordings older than {days} days (before {cutoff_date})")
        
        deleted_count = 0
        
        try:
            if self.storage_type == 's3':
                # List and delete old S3 objects
                paginator = self.s3_client.get_paginator('list_objects_v2')
                pages = paginator.paginate(Bucket=self.s3_bucket)
                
                for page in pages:
                    if 'Contents' not in page:
                        continue
                    
                    for obj in page['Contents']:
                        if obj['LastModified'].replace(tzinfo=None) < cutoff_date:
                            self.s3_client.delete_object(
                                Bucket=self.s3_bucket,
                                Key=obj['Key']
                            )
                            deleted_count += 1
                            
            else:  # local
                # Walk through local directory
                for root, dirs, files in os.walk(self.storage_path):
                    for file in files:
                        if file.endswith('.json'):  # Skip metadata files
                            continue
                        
                        file_path = os.path.join(root, file)
                        file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                        
                        if file_mtime < cutoff_date:
                            os.unlink(file_path)
                            # Delete metadata file if exists
                            metadata_path = file_path + '.json'
                            if os.path.exists(metadata_path):
                                os.unlink(metadata_path)
                            deleted_count += 1
            
            logger.info(f"Cleanup complete: deleted {deleted_count} old recordings")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            raise


# Global storage manager instance
_storage_manager = None

def get_storage_manager() -> StorageManager:
    """Get or create global storage manager instance"""
    global _storage_manager
    if _storage_manager is None:
        _storage_manager = StorageManager()
    return _storage_manager
