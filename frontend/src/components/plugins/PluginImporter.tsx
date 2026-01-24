/**
 * 插件导入组件（拖拽/选择）
 */
import React, { useState, useCallback } from 'react';
import { Upload, Button, message, Modal } from 'antd';
import type { UploadProps } from 'antd';
import { InboxOutlined, FolderAddOutlined } from '@ant-design/icons';
import type { PluginManifest, PluginValidationResult } from '../../types/plugin';
import { validateManifest } from '../../services/plugin/PluginLoader';
import { PluginPermissions } from './PluginPermissions';
import { usePluginStore } from '../../store/pluginStore';
import { electronService } from '../../services/electronService';

const { Dragger } = Upload;

interface PluginImporterProps {
  onImportSuccess?: (pluginId: string) => void;
}

export const PluginImporter: React.FC<PluginImporterProps> = ({ onImportSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [permissionModal, setPermissionModal] = useState<{
    visible: boolean;
    manifest: PluginManifest | null;
    zipPath: string;
  }>({ visible: false, manifest: null, zipPath: '' });

  const registerPlugin = usePluginStore(state => state.registerPlugin);

  // 处理文件上传/拖拽
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      message.error('请选择 .zip 格式的插件包');
      return false;
    }

    setLoading(true);

    try {
      // 获取文件路径 (Electron 环境)
      const filePath = (file as any).path;
      if (!filePath) {
        message.error('无法获取文件路径，请确保在 Electron 环境中运行');
        return false;
      }

      // 调用主进程解压并验证
      const result = await electronService.ipc.invoke('plugin:validate', filePath);

      if (!result.valid) {
        Modal.error({
          title: '插件验证失败',
          content: (
            <ul className="list-disc pl-4">
              {result.errors.map((err: string, i: number) => (
                <li key={i} className="text-red-500">{err}</li>
              ))}
            </ul>
          ),
        });
        return false;
      }

      // 显示权限确认弹窗
      setPermissionModal({
        visible: true,
        manifest: result.manifest,
        zipPath: filePath,
      });

    } catch (err: any) {
      console.error('[PluginImporter] 导入失败:', err);
      message.error(`导入失败: ${err.message}`);
    } finally {
      setLoading(false);
    }

    return false; // 阻止默认上传行为
  }, []);

  // 确认安装
  const handleConfirmInstall = useCallback(async () => {
    const { manifest, zipPath } = permissionModal;
    if (!manifest) return;

    setLoading(true);

    try {
      // 调用主进程安装插件
      const installResult = await electronService.ipc.invoke('plugin:install', {
        zipPath,
        manifest,
      });

      if (installResult.success) {
        // 注册到 store
        registerPlugin(manifest, installResult.rootPath);
        message.success(`插件 "${manifest.name}" 安装成功`);
        onImportSuccess?.(manifest.id);
      } else {
        throw new Error(installResult.error);
      }
    } catch (err: any) {
      message.error(`安装失败: ${err.message}`);
    } finally {
      setLoading(false);
      setPermissionModal({ visible: false, manifest: null, zipPath: '' });
    }
  }, [permissionModal, registerPlugin, onImportSuccess]);

  // 从文件夹导入（开发模式）
  const handleImportFromFolder = useCallback(async () => {
    try {
      const result = await electronService.dialog.showOpenDialog({
        title: '选择插件目录',
        properties: ['openDirectory'],
      });

      if (result.canceled || !result.filePaths?.[0]) return;

      const folderPath = result.filePaths[0];

      // 验证目录中的 manifest.json
      const manifestPath = `${folderPath}/manifest.json`;
      const manifestContent = await electronService.fs.readFile(manifestPath);
      const manifest = JSON.parse(manifestContent);

      const validation = validateManifest(manifest);
      if (!validation.valid) {
        Modal.error({
          title: '插件验证失败',
          content: (
            <ul className="list-disc pl-4">
              {validation.errors.map((err, i) => (
                <li key={i} className="text-red-500">{err}</li>
              ))}
            </ul>
          ),
        });
        return;
      }

      // 直接显示权限确认（开发模式不需要解压）
      setPermissionModal({
        visible: true,
        manifest: validation.manifest!,
        zipPath: folderPath, // 使用文件夹路径
      });

    } catch (err: any) {
      message.error(`导入失败: ${err.message}`);
    }
  }, []);

  const uploadProps: UploadProps = {
    name: 'plugin',
    multiple: false,
    accept: '.zip',
    showUploadList: false,
    beforeUpload: handleFile,
    disabled: loading,
  };

  return (
    <div className="plugin-importer">
      <Dragger {...uploadProps} className="!bg-gray-50 !border-dashed">
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">拖拽插件包到此处，或点击选择</p>
        <p className="ant-upload-hint text-gray-400">
          支持 .zip 格式的插件包
        </p>
      </Dragger>

      <div className="mt-3 flex justify-center">
        <Button
          type="link"
          icon={<FolderAddOutlined />}
          onClick={handleImportFromFolder}
          disabled={loading}
        >
          从文件夹导入（开发模式）
        </Button>
      </div>

      {permissionModal.manifest && (
        <PluginPermissions
          visible={permissionModal.visible}
          manifest={permissionModal.manifest}
          onConfirm={handleConfirmInstall}
          onCancel={() => setPermissionModal({ visible: false, manifest: null, zipPath: '' })}
        />
      )}
    </div>
  );
};

export default PluginImporter;
