// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { LinghuiPromptEditor } from '../components/LinghuiPromptEditor';

describe('LinghuiPromptEditor', () => {
  it('输入 @ 触发引用补全后仍保持编辑器焦点', async () => {
    const Harness = () => {
      const [value, setValue] = useState('');
      return (
        <LinghuiPromptEditor
          value={value}
          onChange={setValue}
          references={[{
            id: 'image-1',
            nodeId: 'image-node-1',
            kind: 'image',
            name: '参考图',
          }]}
        />
      );
    };
    const { container } = render(
      <Harness />,
    );
    const content = container.querySelector('.cm-content') as HTMLElement;
    const view = EditorView.findFromDOM(content);
    expect(view).toBeTruthy();

    await act(async () => {
      view?.focus();
      view?.dispatch({ changes: { from: 0, insert: '@' } });
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(content);
    expect(view?.state.doc.toString()).toBe('@');
    expect(view?.dom.isConnected).toBe(true);
    expect(EditorView.findFromDOM(content)).toBe(view);

    await act(async () => {
      view?.dispatch({ changes: { from: 1, insert: '角色' } });
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(content);
    expect(view?.state.doc.toString()).toBe('@角色');
    expect(EditorView.findFromDOM(content)).toBe(view);
  });
});
