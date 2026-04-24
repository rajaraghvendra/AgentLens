#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './components/App';

export function main() {
  render(React.createElement(App));
}

// Run only if terminal supports interactive input
if (typeof process !== 'undefined' && (process.stdin as any)?.isTTY) {
  main();
}
