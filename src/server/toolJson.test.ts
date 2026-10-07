/** manifestToToolJson：admin manifest → 仓库 tool.json 形状（单个工具导出）。 */
import { describe, expect, it } from 'vitest';

import { manifestToToolJson } from './terravox';
import type { TerraVoxTool } from '@/types/terravox';

const base = {
  schema_version: 1,
  tool_id: 'supermap.map-template',
  version: '1.0.1',
  display_name: '超图模板插件',
  description: 'SuperMap iDesktopX 扩展插件',
  expose: ['ui'],
  allowed_groups: ['*'],
};

describe('manifestToToolJson', () => {
  it('plugin：映射宿主字段，timeout 秒转分钟，result/form 存在才输出', () => {
    const manifest: TerraVoxTool = {
      ...base,
      dangerous: false,
      timeout_seconds: 600,
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      form: { fields: {} },
      execution: {
        kind: 'plugin',
        distribution: {
          source: { type: 'gitea_release', owner: 'bigdata', repo: 'supermap-plugin' },
          version: '1.0.1',
          package_sha256: 'a'.repeat(64),
          host_launcher: 'SuperMap iDesktopX.exe',
          host_root_hints: ['C:\\supermap-idesktopx-12.1.1.0-windows-x64-bin'],
          install_script: 'install.ps1',
          uninstall_script: 'uninstall.ps1',
        },
      },
    } as TerraVoxTool;

    const out = manifestToToolJson(manifest) as Record<string, unknown>;
    expect(out).toMatchObject({
      schema_version: 1,
      version: '1.0.1',
      package_sha256: 'a'.repeat(64),
      host_launcher: 'SuperMap iDesktopX.exe',
      install_script: 'install.ps1',
      dangerous: false,
      timeout_minutes: 10,
    });
    expect(out.host_root_hints).toEqual(['C:\\supermap-idesktopx-12.1.1.0-windows-x64-bin']);
    expect(out.launcher).toBeUndefined();
    expect(out.form).toEqual({ fields: {} });
  });

  it('desktop：映射 launcher/runtime，无 result 时不输出该键', () => {
    const manifest: TerraVoxTool = {
      ...base,
      tool_id: 'wangjianbo.toolsdemo',
      timeout_seconds: 45,
      execution: {
        kind: 'desktop',
        distribution: {
          source: { type: 'gitea_release', owner: 'wangjianbo', repo: 'toolsdemo' },
          package_sha256: 'b'.repeat(64),
          launcher: 'main.py',
          runtime: 'self-contained',
        },
      },
    } as TerraVoxTool;

    const out = manifestToToolJson(manifest) as Record<string, unknown>;
    expect(out).toMatchObject({
      launcher: 'main.py',
      runtime: 'self-contained',
      package_sha256: 'b'.repeat(64),
      timeout_minutes: 1,
    });
    expect(out.host_launcher).toBeUndefined();
    expect('result' in out).toBe(false);
  });

  it('server/web 工具没有仓库包 → null', () => {
    const server: TerraVoxTool = {
      ...base,
      tool_id: 'echo.hello',
      execution: { kind: 'server', handler: 'echo' },
    } as TerraVoxTool;
    expect(manifestToToolJson(server)).toBeNull();
  });
});
