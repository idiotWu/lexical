/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
/* eslint-disable lexical/no-optional-chaining */

import {$getNearestNodeOfType} from '@lexical/utils';
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isLeafNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  DEPRECATED_$isGridSelection,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  RangeSelection,
} from 'lexical';
import invariant from 'shared/invariant';

import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from './';
import {ListType} from './LexicalListNode';
import {$getAllListItems, $getTopListNode, isNestedListNode} from './utils';

function $isSelectingEmptyListItem(
  anchorNode: ListItemNode | LexicalNode,
  nodes: Array<LexicalNode>,
): boolean {
  const listItemNode = $getNearestNodeOfType(anchorNode, ListItemNode);

  return (
    listItemNode !== null &&
    $isParagraphNode(anchorNode) &&
    (nodes.length === 0 ||
      (nodes.length === 1 &&
        anchorNode.is(nodes[0]) &&
        anchorNode.getChildrenSize() === 0))
  );
}

function $getBlockNodeInsideList(
  selection: RangeSelection,
): LexicalNode | null {
  const anchorNode = selection.anchor.getNode();

  if ($isListItemNode(anchorNode)) {
    return anchorNode.getFirstChild();
  }

  let node: LexicalNode | null = anchorNode;

  while (node && !$isListItemNode(node.getParent())) {
    node = node.getParent();
  }

  return node;
}

function $getListItemValue(listItem: ListItemNode): number {
  const list = listItem.getParent();

  let value = 1;

  if (list != null) {
    if (!$isListNode(list)) {
      invariant(
        false,
        '$getListItemValue: list node is not parent of list item node',
      );
    } else {
      value = list.getStart();
    }
  }

  const siblings = listItem.getPreviousSiblings();
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];

    if ($isListItemNode(sibling) && !$isListNode(sibling.getFirstChild())) {
      value++;
    }
  }
  return value;
}

/**
 * Split a list at the given list item
 */
function $splitList(list: ListNode, listItem: ListItemNode): ListNode | null {
  if (listItem.getParent() !== list) {
    throw new Error('list item is not a child of the list');
  }

  const siblings = listItem.getNextSiblings();

  if (!siblings.length) {
    return null;
  }

  const newList = $createListNode(list.getListType());
  newList.append(...siblings);
  list.insertAfter(newList);

  return newList;
}

function $changeListItemType(listItem: ListItemNode, listType: ListType) {
  const list = listItem.getParent();

  if (!$isListNode(list)) {
    throw new Error('list item is not a child of the list');
  }

  if (listItem.is(list.getFirstChild())) {
    const newList = $createListNode(listType);
    newList.append(listItem);
    list.insertBefore(newList);
  } else if (listItem.is(list.getLastChild())) {
    const newList = $createListNode(listType);
    newList.append(listItem);
    list.insertAfter(newList);
  } else {
    $splitList(list, listItem);
    const newList = $createListNode(listType);
    newList.append(listItem);
    list.insertAfter(newList);
  }

  if (list.isEmpty()) {
    list.remove();
  }
}

export function $getNearestListItemNodesFromSelection(): Set<ListItemNode> {
  const selection = $getSelection();
  const nodes = new Set<ListItemNode>();

  if (!$isRangeSelection(selection)) {
    return nodes;
  }

  for (const n of selection.getNodes()) {
    const listItemNode = $getNearestNodeOfType(n, ListItemNode);

    if (listItemNode) {
      nodes.add(listItemNode);
    }
  }

  return nodes;
}

export function registerListTransformer(editor: LexicalEditor) {
  return editor.registerNodeTransform(ListNode, autoMergeSiblingLists);
}

export function $createListItemWithParagraph(checked?: boolean): ListItemNode {
  const listItemNode = $createListItemNode(checked);
  listItemNode.append($createParagraphNode());

  return listItemNode;
}

/**
 * Inserts a new ListNode. If the selection's anchor node is an empty ListItemNode and is a child of
 * the root/shadow root, it will replace the ListItemNode with a ListNode and the old ListItemNode.
 * Otherwise it will replace its parent with a new ListNode and re-insert the ListItemNode and any previous children.
 * If the selection's anchor node is not an empty ListItemNode, it will add a new ListNode or merge an existing ListNode,
 * unless the the node is a leaf node, in which case it will attempt to find a ListNode up the branch and replace it with
 * a new ListNode, or create a new ListNode at the nearest root/shadow root.
 * @param editor - The lexical editor.
 * @param listType - The type of list, "number" | "bullet" | "check".
 */
export function insertList(editor: LexicalEditor, listType: ListType): void {
  editor.update(() => {
    const selection = $getSelection();

    if (
      $isRangeSelection(selection) ||
      DEPRECATED_$isGridSelection(selection)
    ) {
      const nodes = selection.getNodes();
      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();
      const anchorNodeParent = anchorNode.getParent();

      if ($isSelectingEmptyListItem(anchorNode, nodes)) {
        const list = $createListNode(listType);

        if (
          $isRootOrShadowRoot(anchorNodeParent) &&
          !$isListItemNode(anchorNodeParent)
        ) {
          anchorNode.replace(list);
          const listItem = $createListItemNode();
          if ($isElementNode(anchorNode)) {
            listItem.setFormat(anchorNode.getFormatType());
            listItem.setIndent(anchorNode.getIndent());
          }
          list.append(listItem);
        } else if ($isListItemNode(anchorNodeParent)) {
          $changeListItemType(anchorNodeParent, listType);
        }

        return;
      }

      const handled = new Set();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (
          $isElementNode(node) &&
          node.isEmpty() &&
          !handled.has(node.getKey())
        ) {
          const listItem = $getNearestNodeOfType(node, ListItemNode);

          if (listItem) {
            $changeListItemType(listItem, listType);
          }

          continue;
        }

        if ($isLeafNode(node)) {
          let parent = node.getParent();
          while (parent != null) {
            const parentKey = parent.getKey();

            if ($isListItemNode(parent)) {
              if (!handled.has(parentKey)) {
                handled.add(parentKey);
                $changeListItemType(parent, listType);
              }

              break;
            } else {
              const nextParent = parent.getParent();

              if (
                $isRootOrShadowRoot(nextParent) &&
                !$isListItemNode(nextParent) &&
                !handled.has(parentKey)
              ) {
                handled.add(parentKey);
                const newList = $createListNode(listType);
                const newListItem = $createListItemNode();
                parent.insertBefore(newList);
                newListItem.append(parent);
                newList.append(newListItem);
                break;
              }

              parent = nextParent;
            }
          }
        }
      }
    }
  });
}

function append(node: ElementNode, nodesToAppend: Array<LexicalNode>) {
  node.splice(node.getChildrenSize(), 0, nodesToAppend);
}

/**
 * A recursive function that goes through each list and their children, including nested lists,
 * appending list2 children after list1 children and updating ListItemNode values.
 * @param list1 - The first list to be merged.
 * @param list2 - The second list to be merged.
 */
export function mergeLists(list1: ListNode, list2: ListNode): void {
  const listItem1 = list1.getLastChild();
  const listItem2 = list2.getFirstChild();

  if (
    listItem1 &&
    listItem2 &&
    isNestedListNode(listItem1) &&
    isNestedListNode(listItem2)
  ) {
    mergeLists(listItem1.getFirstChild(), listItem2.getFirstChild());
    listItem2.remove();
  }

  const toMerge = list2.getChildren();
  if (toMerge.length > 0) {
    list1.append(...toMerge);
    updateChildrenListItemValue(list1);
  }

  list2.remove();
}

export function autoMergeSiblingLists(listNode: ListNode) {
  const prev = listNode.getPreviousSibling();
  const next = listNode.getNextSibling();

  if ($isListNode(prev) && prev.getListType() === listNode.getListType()) {
    mergeLists(prev, listNode);
  }

  if ($isListNode(next) && next.getListType() === listNode.getListType()) {
    mergeLists(listNode, next);
  }
}

/**
 * Searches for the nearest ancestral ListNode and removes it. If selection is an empty ListItemNode
 * it will remove the whole list, including the ListItemNode. For each ListItemNode in the ListNode,
 * removeList will also generate new ParagraphNodes in the removed ListNode's place. Any child node
 * inside a ListItemNode will be appended to the new ParagraphNodes.
 * @param editor - The lexical editor.
 */
export function removeList(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const listNodes = new Set<ListNode>();
      const nodes = selection.getNodes();
      const anchorNode = selection.anchor.getNode();

      if ($isSelectingEmptyListItem(anchorNode, nodes)) {
        listNodes.add($getTopListNode(anchorNode));
      } else {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];

          if ($isLeafNode(node)) {
            const listItemNode = $getNearestNodeOfType(node, ListItemNode);

            if (listItemNode != null) {
              listNodes.add($getTopListNode(listItemNode));
            }
          }
        }
      }

      for (const listNode of listNodes) {
        let insertionPoint: ListNode | ParagraphNode = listNode;

        const listItems = $getAllListItems(listNode);

        for (const listItemNode of listItems) {
          const paragraph = $createParagraphNode();

          append(paragraph, listItemNode.getChildren());

          insertionPoint.insertAfter(paragraph);
          insertionPoint = paragraph;

          // When the anchor and focus fall on the textNode
          // we don't have to change the selection because the textNode will be appended to
          // the newly generated paragraph.
          // When selection is in empty nested list item, selection is actually on the listItemNode.
          // When the corresponding listItemNode is deleted and replaced by the newly generated paragraph
          // we should manually set the selection's focus and anchor to the newly generated paragraph.
          if (listItemNode.__key === selection.anchor.key) {
            selection.anchor.set(paragraph.getKey(), 0, 'element');
          }
          if (listItemNode.__key === selection.focus.key) {
            selection.focus.set(paragraph.getKey(), 0, 'element');
          }

          listItemNode.remove();
        }
        listNode.remove();
      }
    }
  });
}

/**
 * Takes the value of a child ListItemNode and makes it the value the ListItemNode
 * should be if it isn't already. If only certain children should be updated, they
 * can be passed optionally in an array.
 * @param list - The list whose children are updated.
 * @param children - An array of the children to be updated.
 */
export function updateChildrenListItemValue(
  list: ListNode,
  children?: Array<LexicalNode>,
): void {
  const childrenOrExisting = children || list.getChildren();
  if (childrenOrExisting !== undefined) {
    for (let i = 0; i < childrenOrExisting.length; i++) {
      const child = childrenOrExisting[i];
      if ($isListItemNode(child)) {
        const prevValue = child.getValue();
        const nextValue = $getListItemValue(child);

        if (prevValue !== nextValue) {
          child.setValue(nextValue);
        }
      }
    }
  }
}

/**
 * Adds an empty ListNode/ListItemNode chain at listItemNode, so as to
 * create an indent effect. Won't indent ListItemNodes that have a ListNode as
 * a child, but does merge sibling ListItemNodes if one has a nested ListNode.
 * @param listItemNode - The ListItemNode to be indented.
 */
export function $handleIndent(listItemNode: ListItemNode): void {
  // go through each node and decide where to move it.
  const removed = new Set<NodeKey>();

  if (isNestedListNode(listItemNode) || removed.has(listItemNode.getKey())) {
    return;
  }

  const parent = listItemNode.getParent();

  // We can cast both of the below `isNestedListNode` only returns a boolean type instead of a user-defined type guards
  // const nextSibling =
  //   listItemNode.getNextSibling<ListItemNode>() as ListItemNode;
  const previousSibling =
    listItemNode.getPreviousSibling<ListItemNode>() as ListItemNode;

  // NOTE: DO NOT indent the first list item
  if ($isListNode(parent) && !listItemNode.is(parent.getFirstChild())) {
    // use `$createListItemNode()` here to avoid an extra paragraph
    const newListItem = $createListItemNode();
    const newList = $createListNode(parent.getListType());
    newListItem.append(newList);
    newList.append(listItemNode);

    previousSibling.append(newListItem);
    updateChildrenListItemValue(newList);
    // we will use transformers to merge lists
    // autoMergeSiblingLists(newList);
  }
}

/**
 * Removes an indent by removing an empty ListNode/ListItemNode chain. An indented ListItemNode
 * has a great grandparent node of type ListNode, which is where the ListItemNode will reside
 * within as a child.
 * @param listItemNode - The ListItemNode to remove the indent (outdent).
 */
export function $handleOutdent(listItemNode: ListItemNode): void {
  // go through each node and decide where to move it.
  const parentList = listItemNode.getParent();
  const grandparentListItem = parentList?.getParent();
  const greatGrandparentList = grandparentListItem?.getParent();
  // If it doesn't have these ancestors, it's not indented.

  if (
    $isListNode(greatGrandparentList) &&
    $isListItemNode(grandparentListItem) &&
    $isListNode(parentList)
  ) {
    // if it's the first child in it's parent list, insert it into the
    // great grandparent list after the grandparent...
    const firstChild = parentList.getFirstChild();
    const lastChild = parentList.getLastChild();

    if (listItemNode.is(firstChild)) {
      grandparentListItem.insertAfter(listItemNode);

      if (parentList.isEmpty()) {
        parentList.remove();
      } else {
        // ...and move the parent list into list item
        listItemNode.append(parentList);
      }
      // if it's the last child in it's parent list, insert it into the
      // great grandparent list after the grandparent.
    } else if (listItemNode.is(lastChild)) {
      grandparentListItem.insertAfter(listItemNode);

      if (parentList.isEmpty()) {
        parentList.remove();
      }
    } else {
      // otherwise, we need to split the siblings into two new nested lists
      const siblings = listItemNode.getNextSiblings();
      const newList = $createListNode(parentList.getListType());
      newList.append(...siblings);
      listItemNode.append(newList);
      grandparentListItem.insertAfter(listItemNode);
    }
    updateChildrenListItemValue(parentList);
    updateChildrenListItemValue(greatGrandparentList);
  }
}

/**
 * Attempts to insert a ParagraphNode at selection and selects the new node. The selection must contain a ListItemNode
 * or a node that does not already contain text. If its grandparent is the root/shadow root, it will get the ListNode
 * (which should be the parent node) and insert the ParagraphNode as a sibling to the ListNode. If the ListNode is
 * nested in a ListItemNode instead, it will add the ParagraphNode after the grandparent ListItemNode.
 * Throws an invariant if the selection is not a child of a ListNode.
 * @returns true if a ParagraphNode was inserted succesfully, false if there is no selection
 * or the selection does not contain a ListItemNode or the node already holds text.
 */
export function $handleListInsertParagraph(): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const blockNode = $getBlockNodeInsideList(selection);

  // only run when the anchor is inside the first block
  if (!blockNode) {
    return false;
  }

  const listItem = $getNearestNodeOfType(blockNode, ListItemNode);

  if (!listItem || !blockNode.is(listItem.getFirstChild())) {
    return false;
  }

  if (blockNode.isEmpty()) {
    if (listItem.getIndent() === 0) {
      $handleDelete();
    } else {
      $handleOutdent(listItem);
    }

    return true;
  }

  // insert(split out) a new block at the selection
  selection.insertParagraph();

  // get the newly inserted block
  const newBlock = $getBlockNodeInsideList(selection);

  if (!newBlock) {
    throw new Error('new paragraph not found');
  }

  // move the paragraph into a new list item
  const newListItem = listItem.insertNewAfter(selection, true);
  newListItem.append(newBlock);

  return true;
}

export function $handleDelete(): boolean {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const blockNode = $getBlockNodeInsideList(selection);

  // only remove the list item when selection is at the begining of the first paragraph
  if (!blockNode || selection.anchor.offset !== 0) {
    return false;
  }

  const listItem = $getNearestNodeOfType(blockNode, ListItemNode);

  if (!listItem) {
    return false;
  }

  const listParent = listItem.getParent();

  if (!$isListNode(listParent)) {
    return false;
  }

  // TODO: simplify the following code
  if (blockNode.is(listItem.getFirstChild())) {
    if (listItem.is(listParent.getFirstChild())) {
      listParent.insertBefore(blockNode);
      listItem.remove();

      if (listParent.isEmpty()) {
        listParent.remove();
      }
    } else if (listItem.is(listParent.getLastChild())) {
      listParent.insertAfter(blockNode);
      listItem.remove();
    } else {
      $splitList(listParent, listItem);
      listItem.remove();
      listParent.insertAfter(blockNode);
      blockNode.selectStart();
    }
  } else if (blockNode.is(listItem.getLastChild())) {
    $splitList(listParent, listItem);
    listParent.insertAfter(blockNode);
  } else {
    // removing a paragraph from middle is not allowed
    return false;
  }

  return true;
}
