/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {LexicalEditor} from 'lexical';

import {
  $getNearestListItemNodesFromSelection,
  $handleDelete,
  $handleIndent,
  $handleListInsertParagraph,
  $handleOutdent,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  insertList,
  registerListTransformer,
  REMOVE_LIST_COMMAND,
  removeList,
} from '@lexical/list';
import {mergeRegister} from '@lexical/utils';
import {
  COMMAND_PRIORITY_LOW,
  DELETE_CHARACTER_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import {useEffect} from 'react';

export function useList(editor: LexicalEditor): void {
  useEffect(() => {
    return mergeRegister(
      registerListTransformer(editor),
      editor.registerCommand(
        INSERT_ORDERED_LIST_COMMAND,
        () => {
          insertList(editor, 'number');
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_UNORDERED_LIST_COMMAND,
        () => {
          insertList(editor, 'bullet');
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        REMOVE_LIST_COMMAND,
        () => {
          removeList(editor);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INDENT_CONTENT_COMMAND,
        () => {
          const listItemNodes = $getNearestListItemNodesFromSelection();

          for (const node of listItemNodes) {
            $handleIndent(node);
          }

          return listItemNodes.size !== 0;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        OUTDENT_CONTENT_COMMAND,
        () => {
          const listItemNodes = $getNearestListItemNodesFromSelection();

          for (const node of listItemNodes) {
            $handleOutdent(node);
          }

          return listItemNodes.size !== 0;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        () => {
          return $handleDelete();
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          const hasHandledInsertParagraph = $handleListInsertParagraph();

          if (hasHandledInsertParagraph) {
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);
}
