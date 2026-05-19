import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiNodeData } from '../../../../types/linghui';
import {
  buildGridSliceDerivedItems,
  GridSliceNode,
  normalizeGridSliceSlots,
  swapGridSliceSlots,
} from '../components/GridSliceNode';

const {
  useNodeRunStateMock,
  useLinghuiNodeInteractionMock,
  useLinghuiNodeMutationMock,
  useLinghuiNodeEditorApiMock,
  useLinghuiConnectTargetMock,
} = vi.hoisted(() => ({
  useNodeRunStateMock: vi.fn(),
  useLinghuiNodeInteractionMock: vi.fn(),
  useLinghuiNodeMutationMock: vi.fn(),
  useLinghuiNodeEditorApiMock: vi.fn(),
  useLinghuiConnectTargetMock: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: {
    Left: 'left',
    Right: 'right',
  },
}));

vi.mock('../state/LinghuiNodeRunsContext', () => ({
  useNodeRunState: (...args: unknown[]) => useNodeRunStateMock(...args),
  useLinghuiNodeInteraction: (...args: unknown[]) => useLinghuiNodeInteractionMock(...args),
  useLinghuiNodeMutation: () => useLinghuiNodeMutationMock(),
  useLinghuiNodeEditorApi: () => useLinghuiNodeEditorApiMock(),
}));

vi.mock('../state/useLinghuiConnectTarget', () => ({
  useLinghuiConnectTarget: (...args: unknown[]) => useLinghuiConnectTargetMock(...args),
}));

vi.mock('../components/EditableCompactNodeLabel', () => ({
  EditableCompactNodeLabel: ({ label, fallbackLabel }: { label: string; fallbackLabel?: string }) => (
    <span>{label || fallbackLabel}</span>
  ),
}));

function createGridSliceNodeData(overrides: Partial<LinghuiNodeData['properties']> = {}): LinghuiNodeData {
  return {
    linghuiType: 'linghui/image-grid-slice',
    label: '宫格切分',
    accent: '#38bdf8',
    background: '#0f1720',
    active: true,
    inputs: [{ name: '图片', dataType: 'image' }],
    outputs: [{ name: '切片', dataType: 'images' }],
    properties: {
      source: 'data:image/png;base64,source',
      gridType: '2x2',
      slots: [
        { id: 'slot-0', source: 'data:image/png;base64,a', label: 'A' },
        { id: 'slot-1', source: '', label: 'B' },
        { id: 'slot-2', source: 'data:image/png;base64,c' },
        { id: 'slot-3', source: '', label: 'D' },
      ],
      ...overrides,
    },
  };
}

function renderGridSliceNode(data = createGridSliceNodeData()) {
  return render(
    <GridSliceNode
      {...({
        id: 'grid-slice-1',
        data,
        selected: false,
        dragging: false,
        zIndex: 1,
        xPos: 0,
        yPos: 0,
        type: 'linghui-image-grid-slice',
        isConnectable: true,
      } as any)}
    />,
  );
}

describe('GridSliceNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNodeRunStateMock.mockReturnValue(undefined);
    useLinghuiNodeInteractionMock.mockReturnValue({});
    useLinghuiNodeMutationMock.mockReturnValue({ updateNodeData: vi.fn() });
    useLinghuiNodeEditorApiMock.mockReturnValue({ onCreateDerivedImportImages: vi.fn() });
    useLinghuiConnectTargetMock.mockReturnValue(false);
  });

  it('normalizes slot count without mutating existing slots', () => {
    expect(normalizeGridSliceSlots([{ id: 'a', source: 'x' }], 4)).toEqual([
      { id: 'a', source: 'x' },
      { id: 'slot-1', source: '', label: undefined },
      { id: 'slot-2', source: '', label: undefined },
      { id: 'slot-3', source: '', label: undefined },
    ]);
  });

  it('builds derived image items only from non-empty slots', () => {
    expect(buildGridSliceDerivedItems([
      { id: 'a', source: 'src-a', label: 'A' },
      { id: 'b', source: '' },
      { id: 'c', source: 'src-c' },
    ])).toEqual([
      { id: 'a', source: 'src-a', label: 'A' },
      { id: 'c', source: 'src-c', label: '切片 2' },
    ]);
  });

  it('swaps slots for drag sorting without mutating the original list', () => {
    const slots = [
      { id: 'a', source: 'src-a' },
      { id: 'b', source: 'src-b' },
      { id: 'c', source: 'src-c' },
    ];

    expect(swapGridSliceSlots(slots, 0, 2)).toEqual([
      { id: 'c', source: 'src-c' },
      { id: 'b', source: 'src-b' },
      { id: 'a', source: 'src-a' },
    ]);
    expect(slots[0].id).toBe('a');
    expect(swapGridSliceSlots(slots, -1, 2)).toBe(slots);
  });

  it('renders compose and scatter actions, and scatter derives only non-empty slices', () => {
    const onCreateDerivedImportImages = vi.fn();
    useLinghuiNodeEditorApiMock.mockReturnValue({ onCreateDerivedImportImages });

    renderGridSliceNode();

    expect(screen.getByRole('button', { name: /合成宫格/ })).not.toBeDisabled();
    const scatterButton = screen.getByRole('button', { name: /彻底切分/ });
    expect(scatterButton).not.toBeDisabled();

    fireEvent.click(scatterButton);

    expect(onCreateDerivedImportImages).toHaveBeenCalledWith('grid-slice-1', [
      { id: 'slot-0', source: 'data:image/png;base64,a', label: 'A' },
      { id: 'slot-2', source: 'data:image/png;base64,c', label: '切片 2' },
    ]);
  });

  it('reorders slots when a slice is dragged onto another slot', () => {
    const updateNodeData = vi.fn();
    useLinghuiNodeMutationMock.mockReturnValue({ updateNodeData });

    renderGridSliceNode();

    const sliceA = screen.getByAltText('切片 1').closest('.linghuiGridSliceCell') as HTMLElement;
    const sliceC = screen.getByAltText('切片 3').closest('.linghuiGridSliceCell') as HTMLElement;
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(() => ''),
      files: [],
    };

    fireEvent.dragStart(sliceA, { dataTransfer });
    fireEvent.drop(sliceC, { dataTransfer });

    expect(updateNodeData).toHaveBeenCalledWith('grid-slice-1', expect.any(Function));
    const updater = updateNodeData.mock.calls[0][1] as (prev: LinghuiNodeData) => LinghuiNodeData;
    const next = updater(createGridSliceNodeData());
    expect((next.properties as any).slots.map((slot: { id: string }) => slot.id)).toEqual([
      'slot-2',
      'slot-1',
      'slot-0',
      'slot-3',
    ]);
  });

  it('disables node actions when all slots are empty', () => {
    renderGridSliceNode(createGridSliceNodeData({
      slots: [
        { id: 'slot-0', source: '' },
        { id: 'slot-1', source: '' },
        { id: 'slot-2', source: '' },
        { id: 'slot-3', source: '' },
      ],
    }));

    expect(screen.getByRole('button', { name: /合成宫格/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /彻底切分/ })).toBeDisabled();
  });
});
