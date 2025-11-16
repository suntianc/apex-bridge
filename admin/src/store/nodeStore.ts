import { create } from 'zustand';
import { nodeApi, NodeInfo } from '@/api/nodeApi';

interface NodeState {
  nodes: NodeInfo[];
  selectedNode: NodeInfo | null;
  loading: boolean;
  error: string | null;
  loadNodes: () => Promise<void>;
  selectNode: (node: NodeInfo | null) => void;
  registerNode: (node: Omit<NodeInfo, 'id' | 'registeredAt' | 'status'>) => Promise<void>;
  updateNode: (id: string, updates: Partial<NodeInfo>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],
  selectedNode: null,
  loading: false,
  error: null,
  loadNodes: async () => {
    set({ loading: true, error: null });
    try {
      const nodes = await nodeApi.getNodes();
      set({ nodes, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  selectNode: (node) => {
    set({ selectedNode: node });
  },
  registerNode: async (node) => {
    try {
      await nodeApi.registerNode(node);
      await get().loadNodes(); // 重新加载列表
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },
  updateNode: async (id, updates) => {
    try {
      await nodeApi.updateNode(id, updates);
      await get().loadNodes(); // 重新加载列表
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },
  deleteNode: async (id) => {
    try {
      await nodeApi.deleteNode(id);
      if (get().selectedNode?.id === id) {
        set({ selectedNode: null });
      }
      await get().loadNodes(); // 重新加载列表
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },
}));

