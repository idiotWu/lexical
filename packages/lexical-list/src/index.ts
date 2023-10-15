/** @module @lexical/list */
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {SerializedListItemNode} from './LexicalListItemNode';
import type {ListType, SerializedListNode} from './LexicalListNode';
import type {LexicalCommand} from 'lexical';

import {createCommand} from 'lexical';

import {
  $createListItemWithParagraph,
  $getNearestListItemNodesFromSelection,
  $handleDelete,
  $handleIndent,
  $handleListInsertParagraph,
  $handleOutdent,
  insertList,
  registerListTransformer,
  removeList,
} from './formatList';
import {
  $createListItemNode,
  $isListItemNode,
  ListItemNode,
} from './LexicalListItemNode';
import {$createListNode, $isListNode, ListNode} from './LexicalListNode';
import {$getListDepth} from './utils';

export {
  $createListItemNode,
  $createListItemWithParagraph,
  $createListNode,
  $getListDepth,
  $getNearestListItemNodesFromSelection,
  $handleDelete,
  $handleIndent,
  $handleListInsertParagraph,
  $handleOutdent,
  $isListItemNode,
  $isListNode,
  insertList,
  ListItemNode,
  ListNode,
  ListType,
  registerListTransformer,
  removeList,
  SerializedListItemNode,
  SerializedListNode,
};

export const INSERT_UNORDERED_LIST_COMMAND: LexicalCommand<void> =
  createCommand('INSERT_UNORDERED_LIST_COMMAND');
export const INSERT_ORDERED_LIST_COMMAND: LexicalCommand<void> = createCommand(
  'INSERT_ORDERED_LIST_COMMAND',
);
export const INSERT_CHECK_LIST_COMMAND: LexicalCommand<void> = createCommand(
  'INSERT_CHECK_LIST_COMMAND',
);
export const REMOVE_LIST_COMMAND: LexicalCommand<void> = createCommand(
  'REMOVE_LIST_COMMAND',
);
