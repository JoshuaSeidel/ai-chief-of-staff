// Shim for react-native to allow @callstack/liquid-glass to work in web
// This provides empty implementations of react-native APIs that liquid-glass might reference

export const Platform = {
  OS: 'web',
  select: (obj) => obj.web || obj.default
};

export const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style
};

export const Dimensions = {
  get: () => ({
    width: window.innerWidth,
    height: window.innerHeight
  })
};

export const Animated = {
  View: 'div',
  Text: 'span',
  Value: class AnimatedValue {
    constructor(value) {
      this._value = value;
    }
  },
  timing: () => ({
    start: () => {}
  })
};

export const View = 'div';
export const Text = 'span';
export const TouchableOpacity = 'button';
export const Image = 'img';

export default {
  Platform,
  StyleSheet,
  Dimensions,
  Animated,
  View,
  Text,
  TouchableOpacity,
  Image
};
