const fetch = require('node-fetch');
const { getConfig } = require('../utils/db-helper');

const TRELLO_API_BASE = 'https://api.trello.com/1';

const logger = {
  info: (msg, ...args) => console.log(`[Trello] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[Trello ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[Trello WARNING] ${msg}`, ...args)
};

/**
 * Get Trello API credentials from database
 */
async function getCredentials() {
  const apiKey = await getConfig('trelloApiKey');
  const token = await getConfig('trelloToken');
  
  if (!apiKey || !token) {
    throw new Error('Trello API credentials not configured');
  }
  
  return { apiKey, token };
}

/**
 * Make authenticated request to Trello API
 */
async function makeRequest(endpoint, options = {}) {
  const { apiKey, token } = await getCredentials();
  
  // Note: Trello API requires key/token in query params (not headers)
  // This is Trello's documented authentication method
  const url = new URL(`${TRELLO_API_BASE}${endpoint}`);
  url.searchParams.append('key', apiKey);
  url.searchParams.append('token', token);
  
  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Trello API error: ${response.status} ${response.statusText}`);
    logger.error(`Response: ${errorText}`);
    throw new Error(`Trello API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check if Trello is configured and accessible
 */
async function checkStatus() {
  try {
    const { apiKey, token } = await getCredentials();
    
    // Test the connection by fetching member info
    const member = await makeRequest('/members/me');
    
    logger.info(`Connected to Trello as: ${member.fullName} (${member.username})`);
    
    return {
      connected: true,
      user: {
        id: member.id,
        username: member.username,
        fullName: member.fullName,
        email: member.email
      }
    };
  } catch (err) {
    logger.error('Trello connection check failed:', err);
    return {
      connected: false,
      error: err.message
    };
  }
}

/**
 * Get list of boards accessible to the user
 */
async function getBoards() {
  try {
    const boards = await makeRequest('/members/me/boards');
    
    return boards.map(board => ({
      id: board.id,
      name: board.name,
      url: board.url,
      closed: board.closed,
      starred: board.starred
    }));
  } catch (err) {
    logger.error('Error fetching Trello boards:', err);
    throw err;
  }
}

/**
 * Get lists from a specific board
 */
async function getLists(boardId) {
  try {
    const lists = await makeRequest(`/boards/${boardId}/lists`);
    
    return lists.map(list => ({
      id: list.id,
      name: list.name,
      closed: list.closed,
      pos: list.pos
    }));
  } catch (err) {
    logger.error(`Error fetching lists for board ${boardId}:`, err);
    throw err;
  }
}

/**
 * Create a new card
 */
async function createCard(data) {
  try {
    const { title, description, listId, boardId, dueDate, labels } = data;
    
    // If no listId provided, get default from config
    let targetListId = listId;
    if (!targetListId) {
      targetListId = await getConfig('trelloListId');
    }
    
    if (!targetListId) {
      throw new Error('No list ID provided and no default configured');
    }
    
    const params = new URLSearchParams();
    params.append('name', title);
    params.append('idList', targetListId);
    
    if (description) {
      params.append('desc', description);
    }
    
    if (dueDate) {
      params.append('due', new Date(dueDate).toISOString());
    }
    
    if (labels && labels.length > 0) {
      params.append('idLabels', labels.join(','));
    }
    
    const card = await makeRequest(`/cards?${params.toString()}`, {
      method: 'POST'
    });
    
    logger.info(`Created Trello card: ${card.name} (${card.id})`);
    
    return {
      id: card.id,
      name: card.name,
      desc: card.desc,
      url: card.url,
      due: card.due,
      dueComplete: card.dueComplete
    };
  } catch (err) {
    logger.error('Error creating Trello card:', err);
    throw err;
  }
}

/**
 * Update an existing card
 */
async function updateCard(cardId, updates) {
  try {
    const { title, description, dueDate, dueComplete, listId } = updates;
    
    const params = new URLSearchParams();
    
    if (title) params.append('name', title);
    if (description !== undefined) params.append('desc', description);
    if (dueDate) params.append('due', new Date(dueDate).toISOString());
    if (dueComplete !== undefined) params.append('dueComplete', dueComplete);
    if (listId) params.append('idList', listId);
    
    const card = await makeRequest(`/cards/${cardId}?${params.toString()}`, {
      method: 'PUT'
    });
    
    logger.info(`Updated Trello card: ${card.name} (${card.id})`);
    
    return {
      id: card.id,
      name: card.name,
      desc: card.desc,
      url: card.url,
      due: card.due,
      dueComplete: card.dueComplete
    };
  } catch (err) {
    logger.error(`Error updating Trello card ${cardId}:`, err);
    throw err;
  }
}

/**
 * Add a comment to a card
 */
async function addComment(cardId, text) {
  try {
    const params = new URLSearchParams();
    params.append('text', text);
    
    const comment = await makeRequest(`/cards/${cardId}/actions/comments?${params.toString()}`, {
      method: 'POST'
    });
    
    logger.info(`Added comment to Trello card ${cardId}`);
    
    return {
      id: comment.id,
      text: comment.data.text,
      date: comment.date
    };
  } catch (err) {
    logger.error(`Error adding comment to Trello card ${cardId}:`, err);
    throw err;
  }
}

/**
 * Archive (close) a card with optional completion note
 */
async function archiveCard(cardId, completionNote) {
  try {
    // First add completion note as comment if provided
    if (completionNote) {
      await addComment(cardId, `✅ Completed: ${completionNote}`);
    }
    
    // Mark card as complete (if it has a due date)
    await makeRequest(`/cards/${cardId}?dueComplete=true`, {
      method: 'PUT'
    });
    
    // Archive the card
    const card = await makeRequest(`/cards/${cardId}?closed=true`, {
      method: 'PUT'
    });
    
    logger.info(`Archived Trello card: ${card.name} (${card.id})`);
    
    return {
      id: card.id,
      name: card.name,
      closed: card.closed
    };
  } catch (err) {
    logger.error(`Error archiving Trello card ${cardId}:`, err);
    throw err;
  }
}

/**
 * Delete a card permanently
 */
async function deleteCard(cardId) {
  try {
    await makeRequest(`/cards/${cardId}`, {
      method: 'DELETE'
    });
    
    logger.info(`Deleted Trello card: ${cardId}`);
    
    return { success: true };
  } catch (err) {
    logger.error(`Error deleting Trello card ${cardId}:`, err);
    throw err;
  }
}

/**
 * Get cards from a specific list
 */
async function getCards(listId) {
  try {
    const cards = await makeRequest(`/lists/${listId}/cards`);
    
    return cards.map(card => ({
      id: card.id,
      name: card.name,
      desc: card.desc,
      url: card.url,
      due: card.due,
      dueComplete: card.dueComplete,
      closed: card.closed,
      labels: card.labels
    }));
  } catch (err) {
    logger.error(`Error fetching cards for list ${listId}:`, err);
    throw err;
  }
}

/**
 * Search for cards
 */
async function searchCards(query, boardId) {
  try {
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('modelTypes', 'cards');
    
    if (boardId) {
      params.append('idBoards', boardId);
    }
    
    const results = await makeRequest(`/search?${params.toString()}`);
    
    return results.cards.map(card => ({
      id: card.id,
      name: card.name,
      desc: card.desc,
      url: card.url,
      due: card.due,
      dueComplete: card.dueComplete,
      closed: card.closed
    }));
  } catch (err) {
    logger.error('Error searching Trello cards:', err);
    throw err;
  }
}

module.exports = {
  checkStatus,
  getBoards,
  getLists,
  createCard,
  updateCard,
  addComment,
  archiveCard,
  deleteCard,
  getCards,
  searchCards
};
