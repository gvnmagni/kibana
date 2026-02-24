/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';

const MAX_UNDO_STACK = 50;

export type UndoFn = () => Promise<void>;

export function initializeUndoManager() {
  const stack: UndoFn[] = [];
  const canUndo$ = new BehaviorSubject(false);

  const pushUndo = (fn: UndoFn) => {
    if (stack.length >= MAX_UNDO_STACK) stack.shift();
    stack.push(fn);
    canUndo$.next(true);
  };

  const runUndo = async () => {
    const fn = stack.pop();
    if (!fn) return;
    try {
      await fn();
    } finally {
      canUndo$.next(stack.length > 0);
    }
  };

  return {
    pushUndo,
    runUndo,
    canUndo$,
  };
}
