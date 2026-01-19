/**
 * 快捷键帮助面板
 */
import React from 'react';
import { Modal, Table } from 'antd';
import { SHORTCUT_LIST } from '../../hooks/useEditorShortcuts';

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

const columns = [
  {
    title: '快捷键',
    dataIndex: 'key',
    key: 'key',
    width: 150,
    render: (key: string) => (
      <kbd style={styles.kbd}>{key}</kbd>
    ),
  },
  {
    title: '功能',
    dataIndex: 'description',
    key: 'description',
  },
];

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <Modal
      title="快捷键"
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
    >
      <Table
        dataSource={SHORTCUT_LIST.map((s, i) => ({ ...s, key: s.key, id: i }))}
        columns={columns}
        pagination={false}
        size="small"
        rowKey="id"
      />
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  kbd: {
    padding: '2px 6px',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 12,
  },
};

export default ShortcutHelp;
