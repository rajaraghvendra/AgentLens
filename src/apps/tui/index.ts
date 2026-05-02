#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';

export function main() {
  render(React.createElement(App));
}

async function run() {
  if (typeof process !== 'undefined' && (process.stdin as any)?.isTTY) {
    main();
  }
}

run();
