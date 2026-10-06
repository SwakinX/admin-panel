import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToolGroupsTab } from '../ToolGroupsTab';

/* 真实 dnd-kit（importOriginal 不桩化）驱动分组详情双列表跨列拖拽的行为回归。
 *
 * 事件配方（MinimalDnd.test 验证过的关键点）：全部 PointerEvent 派发到把手上
 * （真实事件从拖拽节点冒泡——dnd-kit 只按此路径消费），几何用 rect 桩给出
 * 两列网格的可预测布局。 */

vi.mock('@dnd-kit/core', async (importOriginal) => await importOriginal());
vi.mock('@dnd-kit/sortable', async (importOriginal) => await importOriginal());
vi.mock('@dnd-kit/utilities', async (importOriginal) => await importOriginal());
vi.mock('@dnd-kit/modifiers', async (importOriginal) => await importOriginal());

const mocks = vi.hoisted(() => ({
  state: {
    groups: [] as Array<Record<string, unknown>>,
    tools: [] as Array<Record<string, unknown>>,
    updateTool: vi.fn(),
  },
}));

vi.mock('@/hooks/useLocalize', () => {
  const localize = (key: string) => key;
  return { default: () => localize, useLocalize: () => localize };
});

vi.mock('@/server', () => ({
  toolGroupsQueryOptions: {
    queryKey: ['t', 'groups'],
    queryFn: () => Promise.resolve(mocks.state.groups),
  },
  toolsQueryOptions: {
    queryKey: ['t', 'tools'],
    queryFn: () => Promise.resolve({ tools: mocks.state.tools, groups: [] }),
  },
  createToolGroupFn: vi.fn(),
  deleteToolGroupFn: vi.fn(),
  updateToolGroupFn: vi.fn(),
  updateToolFn: mocks.state.updateTool,
}));

vi.mock('@/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const GROUPS = [
  {
    name: 'data',
    display_name: '数据处理',
    description: '',
    sort_order: 0,
    allowed_groups: ['*'],
    explicit: true,
    tool_count: 1,
  },
];

const TOOLS = [
  {
    schema_version: 1,
    tool_id: 'echo.hello',
    version: '1.0.0',
    display_name: '回声测试',
    description: '',
    expose: ['ui'],
    allowed_groups: ['*'],
    enabled: true,
    display_group: 'data',
  },
  {
    schema_version: 1,
    tool_id: 'demo.echo',
    version: '1.0.0',
    display_name: '另一个工具',
    description: '',
    expose: ['ui'],
    allowed_groups: ['*'],
    enabled: true,
  },
];

/** 弹窗双列表几何桩：左列把手 (403, 289+i*30)，右列 (745, 289+i*30)。
 * 碰撞检测读取的是可排序行节点（.flex.items-center）的矩形。 */
function stubDialogRects() {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const dialog = this.closest('[role="dialog"]');
    if (!dialog) {
      return {
        x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}),
      } as DOMRect;
    }
    const gridCol = this.closest('.grid > div');
    if (!gridCol) {
      return {
        x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}),
      } as DOMRect;
    }
    const rows = [...(gridCol.querySelectorAll('.flex.items-center') ?? [])];
    const rowIdx = Math.max(0, rows.indexOf(this.closest('.flex.items-center') as HTMLElement));
    const x = colsIndexOf(dialog, gridCol) === 0 ? 403 : 745;
    const y = 289 + rowIdx * 30;
    return {
      x, y, width: 300, height: 24, top: y, left: x, right: x + 300, bottom: y + 24,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

function colsIndexOf(dialog: Element, gridCol: Element): number {
  return [...(dialog.querySelector('.grid')?.children ?? [])].indexOf(gridCol);
}

describe('GroupToolsDialog cross-column drag (REAL dnd-kit)', () => {
  beforeEach(() => {
    mocks.state.groups = GROUPS;
    mocks.state.tools = TOOLS;
    mocks.state.updateTool.mockClear();
    stubDialogRects();
  });

  it('transfers a left-column tool to the right column and commits', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToolGroupsTab />
      </QueryClientProvider>,
    );
    await screen.findByText('数据处理');
    fireEvent.click(screen.getByRole('button', { name: 'com_tools_group_detail_manage' }));
    await screen.findByText('com_tools_group_detail_left');

    const dialog = screen.getByRole('dialog');
    const cols = [...dialog.querySelectorAll('.grid > div')];
    const leftGrip = cols[0].querySelector('span[title]');
    const rightGrip = cols[1].querySelector('span[title]');
    expect(leftGrip).toBeTruthy();
    expect(rightGrip).toBeTruthy();

    const from = leftGrip!.getBoundingClientRect();
    const to = rightGrip!.getBoundingClientRect();
    const sx = from.x + from.width / 2;
    const sy = from.y + from.height / 2;
    const ex = to.x + to.width / 2;
    const ey = to.y + to.height / 2;

    // 逐事件 dispatch（fireEvent 自带 act flush）——单次 act 包全部事件会让
    // dnd-kit 的碰撞检测 useEffect 只在末尾跑一次，跨列 dragOver 永不触发
    fireEvent.pointerDown(leftGrip!, {
      pointerId: 1, isPrimary: true, clientX: sx, clientY: sy, button: 0, buttons: 1,
    });
    fireEvent.pointerMove(leftGrip!, {
      pointerId: 1, isPrimary: true, clientX: sx + 20, clientY: sy, button: -1, buttons: 1,
    });
    fireEvent.pointerMove(leftGrip!, {
      pointerId: 1, isPrimary: true, clientX: (sx + ex) / 2, clientY: ey, button: -1, buttons: 1,
    });
    fireEvent.pointerMove(leftGrip!, {
      pointerId: 1, isPrimary: true, clientX: ex, clientY: ey, button: -1, buttons: 1,
    });
    // 转移后原把手已随重渲染脱离 DOM——脱离节点上派发的事件不冒泡到 document，
    // dnd-kit 的 onDragEnd 永不触发（真实鼠标 pointerup 落在光标下无此问题）。
    // 改在仍在 DOM 的右列把手上派发 pointerup。
    const attachedGrip = screen.getByRole('dialog').querySelector('.grid > div:last-child span[title]');
    fireEvent.pointerUp(attachedGrip!, {
      pointerId: 1, clientX: ex, clientY: ey, button: -1, buttons: 0,
    });

    // 落库：updateToolFn 被调用于 demo.echo（添加进 data 组，display_order 落位）
    await vi.waitFor(() => {
      expect(mocks.state.updateTool).toHaveBeenCalled();
    });
    const calls = mocks.state.updateTool.mock.calls.map((c) => c[0]);
    const transferred = calls.find((c) => c.data.toolId === 'demo.echo');
    expect(transferred).toBeTruthy();
    expect(transferred.data.manifest.display_group).toBe('data');
    expect(typeof transferred.data.manifest.display_order).toBe('number');
  });
});
