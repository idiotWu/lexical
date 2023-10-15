/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  ElementTransformer,
  TextFormatTransformer,
  TextMatchTransformer,
  Transformer,
} from './MarkdownTransformers';
import type {ElementNode, LexicalNode, TextFormatType, TextNode} from 'lexical';

import {$isLinkNode} from '@lexical/link';
import {
  type DecoratorBlockNode,
  $isDecoratorBlockNode,
} from '@lexical/react/LexicalDecoratorBlockNode';
import {
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRootNode,
  $isTextNode,
} from 'lexical';

import {transformersByType} from './utils';

export function createMarkdownExport(
  transformers: Array<Transformer>,
): (node?: ElementNode | DecoratorBlockNode) => string {
  const byType = transformersByType(transformers);

  // Export only uses text formats that are responsible for single format
  // e.g. it will filter out *** (bold, italic) and instead use separate ** and *
  const textFormatTransformers = byType.textFormat.filter(
    (transformer) => transformer.format.length === 1,
  );

  return (node) => {
    node = node || $getRoot();

    const output = [];
    // Support exporting a single block-level element
    const children = $isRootNode(node) ? node.getChildren() : [node];

    for (const child of children) {
      const result = exportTopLevelElements(
        child,
        byType.element,
        textFormatTransformers,
        byType.textMatch,
      );

      if (result != null) {
        output.push(result);
      }
    }

    return output.join('\n\n');
  };
}

function exportTopLevelElements(
  node: LexicalNode,
  elementTransformers: Array<ElementTransformer>,
  textTransformersIndex: Array<TextFormatTransformer>,
  textMatchTransformers: Array<TextMatchTransformer>,
): string | null {
  for (const transformer of elementTransformers) {
    const result = transformer.export(
      node,
      (_node) =>
        exportChildren(
          _node,
          elementTransformers,
          textTransformersIndex,
          textMatchTransformers,
        ),
      (textNode, textContent) =>
        exportTextFormat(textNode, textContent, textTransformersIndex),
    );

    if (result != null) {
      return result;
    }
  }

  if ($isElementNode(node)) {
    return exportChildren(
      node,
      elementTransformers,
      textTransformersIndex,
      textMatchTransformers,
    );
  }
  if ($isDecoratorNode(node)) {
    return node.getTextContent();
  }
  return null;
}

function exportChildren(
  node: ElementNode,
  elementTransformers: Array<ElementTransformer>,
  textTransformersIndex: Array<TextFormatTransformer>,
  textMatchTransformers: Array<TextMatchTransformer>,
): string {
  const output = [];
  const children = node.getChildren();

  // eslint-disable-next-line no-labels
  mainLoop: for (const child of children) {
    for (const transformer of textMatchTransformers) {
      const result = transformer.export(
        child,
        (parentNode) =>
          exportChildren(
            parentNode,
            elementTransformers,
            textTransformersIndex,
            textMatchTransformers,
          ),
        (textNode, textContent) =>
          exportTextFormat(textNode, textContent, textTransformersIndex),
      );

      if (result != null) {
        output.push(result);
        // eslint-disable-next-line no-labels
        continue mainLoop;
      }
    }

    if ($isLineBreakNode(child)) {
      output.push('\n');
    } else if ($isTextNode(child)) {
      output.push(
        exportTextFormat(child, child.getTextContent(), textTransformersIndex),
      );
    } else if ($isElementNode(child) || $isDecoratorBlockNode(child)) {
      let content = exportTopLevelElements(
        child,
        elementTransformers,
        textTransformersIndex,
        textMatchTransformers,
      );

      // insert line break for block-level children
      if (!child.isInline()) {
        content += '\n';
        // don't prepend newline for the first child
        if (child.getIndexWithinParent() !== 0) {
          content = '\n' + content;
        }
      }

      output.push(content);
    } else if ($isDecoratorNode(child)) {
      output.push(child.getTextContent());
    }
  }

  return output.join('');
}

function exportTextFormat(
  node: TextNode,
  textContent: string,
  textTransformers: Array<TextFormatTransformer>,
): string {
  // This function handles the case of a string looking like this: "   foo   "
  // Where it would be invalid markdown to generate: "**   foo   **"
  // We instead want to trim the whitespace out, apply formatting, and then
  // bring the whitespace back. So our returned string looks like this: "   **foo**   "
  const frozenString = textContent.trim();
  let output = frozenString;

  const applied = new Set();

  let opening = '';
  let ending = '';

  for (const transformer of textTransformers) {
    const format = transformer.format[0];
    // TODO: support stratTag and endTag in config
    let startTag = transformer.tag;
    let endTag = startTag;

    if (hasFormat(node, format) && !applied.has(format)) {
      // Multiple tags might be used for the same format (*, _)
      applied.add(format);

      // escape tag symbols
      const t0 = startTag[0];

      if (output.includes(t0)) {
        if (format !== 'code') {
          const regex = new RegExp(`(?<!\\\\)\\${t0}`, 'g');
          output = output.replaceAll(regex, `\\${t0}`);
        } else {
          startTag = '<code>';
          endTag = '</code>';
        }
      }

      // Prevent adding opening tag is already opened by the previous sibling
      const previousNode = getTextSibling(node, true);

      if (!hasFormat(previousNode, format)) {
        opening += startTag;
      }

      // Prevent adding closing tag if next sibling will do it
      const nextNode = getTextSibling(node, false);

      if (!hasFormat(nextNode, format)) {
        ending = endTag + ending;
      }
    }
  }

  // concat tags
  output = opening + output + ending;

  // Escape the dollar symbols to avoid being recognized as replacement patterns
  output = output.replaceAll('$', '$$$$');

  // Escape html tags
  if (!node.hasFormat('code')) {
    output = output.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  let wrappedWithHTML = false;

  // support underlines
  if (node.hasFormat('underline') && $isNonCodeOrLinkTextNode(node)) {
    wrappedWithHTML = true;
    output = `<u>${output}</u>`;
  }

  if (wrappedWithHTML && node.getIndexWithinParent() === 0) {
    // pad start with a zero width space so that the markdown inside the tag can be handled
    output = '\u200b' + output;
  }

  // Replace trimmed version of textContent ensuring surrounding whitespace is not modified
  return textContent.replace(frozenString, output);
}

function $isNonCodeOrLinkTextNode(node: LexicalNode | null): node is TextNode {
  if (!node) {
    return false;
  }

  return (
    $isTextNode(node) &&
    !$isLinkNode(node.getParent()) &&
    !node.hasFormat('code')
  );
}

// Get next or previous text sibling a text node, including cases
// when it's a child of inline element (e.g. link)
function getTextSibling(node: TextNode, backward: boolean): TextNode | null {
  if (!$isNonCodeOrLinkTextNode(node)) {
    return null;
  }

  let sibling = backward ? node.getPreviousSibling() : node.getNextSibling();

  if (!sibling) {
    const parent = node.getParentOrThrow();

    if (parent.isInline()) {
      sibling = backward
        ? parent.getPreviousSibling()
        : parent.getNextSibling();
    }
  }

  while (sibling) {
    if ($isElementNode(sibling)) {
      if (!sibling.isInline()) {
        break;
      }

      const descendant = backward
        ? sibling.getLastDescendant()
        : sibling.getFirstDescendant();

      if ($isNonCodeOrLinkTextNode(descendant)) {
        return descendant;
      }
      sibling = backward
        ? sibling.getPreviousSibling()
        : sibling.getNextSibling();
    }

    if ($isNonCodeOrLinkTextNode(sibling)) {
      return sibling;
    }

    if (!$isElementNode(sibling)) {
      return null;
    }
  }

  return null;
}

function hasFormat(
  node: LexicalNode | null | undefined,
  format: TextFormatType,
): boolean {
  return $isTextNode(node) && node.hasFormat(format);
}
