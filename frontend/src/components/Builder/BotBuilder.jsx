import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { BotConfigNode, WhitelistNode, BacktestNode, ApiKeyNode, IndicatorNode, ConditionNode, LogicNode, StopLossNode, TakeProfitNode, ActionNode, PriceDataNode } from './CustomNodes';
import { apiClient } from '../../api/client';
import Modal from '../ui/Modal';

const nodeTypes = {
  botConfig: BotConfigNode,
  whitelist: WhitelistNode,
  backtest: BacktestNode,
  apiKey: ApiKeyNode,
  indicator: IndicatorNode,
  condition: ConditionNode,
  logic: LogicNode,
  stopLoss: StopLossNode,
  takeProfit: TakeProfitNode,
  action: ActionNode,
  priceData: PriceDataNode,
};

const getId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Parses trigger/close values to floats while leaving other string fields untouched
const parseSafeFloat = (val) => {
    if (val === "" || val === undefined || val === null) return "";
    const parsed = parseFloat(String(val).replace(',', '.'));
    return isNaN(parsed) ? "" : parsed;
};

/**
 * Reconstruct ReactFlow nodes + edges from bot settings when ui_layout is empty.
 * This handles bots created programmatically or imported without visual layout data.
 */
function rebuildLayoutFromSettings(settings, updateNodeData, deleteNode) {
    const nodes = [];
    const edges = [];
    const edgeStyle = { stroke: '#848e9c', strokeWidth: 2 };
    const GAP = 50; // universal gap between nodes

    // ── Measured rendered widths and heights from CSS min-w + content ──
    const SIZE = {
        config:    { w: 300, h: 620 },
        whitelist: { w: 280, h: 120 },
        backtest:  { w: 300, h: 130 },
        apiKey:    { w: 280, h: 160 },
        indicator: { w: 270, h: 200 }, // base; grows with params
        priceData: { w: 240, h: 190 },
        condition: { w: 280, h: 200 },
        logic:     { w: 220, h: 90  },
        action:    { w: 340, h: 280 },
        actionExit:{ w: 340, h: 200 },
        tp:        { w: 300, h: 180 },
        sl:        { w: 300, h: 180 },
    };

    // ── AREA 1: Setup & Context ──
    // Config left, context blocks stacked right
    nodes.push({
        id: 'rebuilt_config', type: 'botConfig', position: { x: 50, y: 50 },
        data: {
            onChange: updateNodeData, onDelete: deleteNode, botName: '',
            timeframe: settings.timeframe || '1m',
            executionMode: settings.api_execution ? 'exchange' : 'paper',
            maxPositions: settings.max_positions ?? 1,
            maxPositionsScope: settings.max_positions_scope || 'per_pair',
            cooldownTrades: settings.cooldown_trades ?? 0,
            cooldownCandles: settings.cooldown_candles ?? 0,
            maxDrawdown: settings.max_drawdown ?? 0,
            maxOrderValue: settings.max_order_value ?? 0,
        }
    });

    const ctxX = 50 + SIZE.config.w + GAP + 20;
    let ctxY = 50;

    const pairs = settings.symbols?.join(', ') || settings.symbol || 'BTC/USDC';
    nodes.push({ id: 'rebuilt_whitelist', type: 'whitelist', position: { x: ctxX, y: ctxY },
        data: { onChange: updateNodeData, onDelete: deleteNode, pairs } });
    ctxY += SIZE.whitelist.h + GAP + 20;

    if (settings.backtest_on_start !== undefined) {
        nodes.push({ id: 'rebuilt_backtest', type: 'backtest', position: { x: ctxX, y: ctxY },
            data: { onChange: updateNodeData, onDelete: deleteNode,
                runOnStart: settings.backtest_on_start ?? true,
                capital: settings.backtest_capital ?? 1000,
                lookback: settings.backtest_lookback ?? 150 } });
        ctxY += SIZE.backtest.h + GAP + 20;
    }

    if (settings.api_key_name || settings.data_exchange) {
        nodes.push({ id: 'rebuilt_apikey', type: 'apiKey', position: { x: ctxX, y: ctxY },
            data: { onChange: updateNodeData, onDelete: deleteNode,
                apiKeyName: settings.api_key_name || null,
                dataExchange: settings.data_exchange || 'okx' } });
    }

    // ── AREA 2: Strategy logic ──
    const settingsNodes = settings.nodes || {};
    const ordered = [];
    const visited = new Set();
    function collectDeps(nid) {
        if (!nid || visited.has(nid) || !settingsNodes[nid]) return;
        visited.add(nid);
        const n = settingsNodes[nid];
        if (n.left && typeof n.left === 'string') collectDeps(n.left);
        if (n.right && typeof n.right === 'string') collectDeps(n.right);
        ordered.push(nid);
    }
    if (settings.entry_node) collectDeps(settings.entry_node);
    if (settings.exit_node) collectDeps(settings.exit_node);
    for (const nid of Object.keys(settingsNodes)) if (!visited.has(nid)) collectDeps(nid);

    // Column x-positions: each column starts after previous column's width + generous gap
    // Using 80px gaps to account for connection handles (20px each side) + visual breathing room
    const COL_GAP = 80;
    const C1_X = 50;                                     // indicators / price data
    const C2_X = C1_X + SIZE.indicator.w + COL_GAP;      // 400: conditions
    const C3_X = C2_X + SIZE.condition.w + COL_GAP;      // 760: logic gates
    const C4_X = C3_X + SIZE.logic.w + COL_GAP;          // 1060: actions
    const C5_X = C4_X + SIZE.action.w + COL_GAP;         // 1480: TP / SL

    const strategyY = 50 + SIZE.config.h + GAP;          // 600
    let c1Y = strategyY, c2Y = strategyY, c3Y = strategyY;

    // Compute indicator height based on param count + output line selector
    function indicatorHeight(n) {
        const paramCount = n.params ? Object.keys(n.params).length : 1;
        // output_idx > 0 means multi-line indicator with dropdown selector (~60px extra)
        const hasMultiLine = n.output_idx !== undefined && n.output_idx > 0;
        return 140 + paramCount * 45 + (hasMultiLine ? 70 : 0);
    }

    for (const nid of ordered) {
        const n = settingsNodes[nid];
        const cls = n.class;

        if (cls === 'indicator') {
            const h = indicatorHeight(n);
            nodes.push({ id: nid, type: 'indicator', position: { x: C1_X, y: c1Y },
                data: { onChange: updateNodeData, onDelete: deleteNode,
                    indicator: n.method || 'rsi', params: n.params || { length: 14 },
                    outputIdx: n.output_idx ?? 0 } });
            c1Y += h + GAP;
        } else if (cls === 'price_data') {
            nodes.push({ id: nid, type: 'priceData', position: { x: C1_X, y: c1Y },
                data: { onChange: updateNodeData, onDelete: deleteNode,
                    priceType: n.type || 'close', offset: n.offset ?? 0 } });
            c1Y += SIZE.priceData.h + GAP;
        } else if (cls === 'condition') {
            const rightVal = (n.right != null && !settingsNodes[n.right]) ? String(n.right) : '';
            nodes.push({ id: nid, type: 'condition', position: { x: C2_X, y: c2Y },
                data: { onChange: updateNodeData, onDelete: deleteNode,
                    operator: n.operator || '>', rightValue: rightVal } });
            if (n.left && settingsNodes[n.left])
                edges.push({ id: `e_${n.left}_${nid}_l`, source: n.left, target: nid, targetHandle: 'left', animated: true, style: edgeStyle });
            if (n.right && settingsNodes[n.right])
                edges.push({ id: `e_${n.right}_${nid}_r`, source: n.right, target: nid, targetHandle: 'right', animated: true, style: edgeStyle });
            c2Y += SIZE.condition.h + GAP + 10;
        } else if (cls === 'logic') {
            nodes.push({ id: nid, type: 'logic', position: { x: C3_X, y: c3Y },
                data: { onChange: updateNodeData, onDelete: deleteNode,
                    logicType: n.operator || 'and' } });
            if (n.left && settingsNodes[n.left])
                edges.push({ id: `e_${n.left}_${nid}_1`, source: n.left, target: nid, targetHandle: 'in1', animated: true, style: edgeStyle });
            if (n.right && settingsNodes[n.right])
                edges.push({ id: `e_${n.right}_${nid}_2`, source: n.right, target: nid, targetHandle: 'in2', animated: true, style: edgeStyle });
            c3Y += SIZE.logic.h + GAP;
        }
    }

    // ── Action nodes ──
    const entryTs = settings.trade_settings?.entry || {};
    const entryId = 'rebuilt_entry';
    nodes.push({ id: entryId, type: 'action', position: { x: C4_X, y: strategyY },
        data: { onChange: updateNodeData, onDelete: deleteNode, actionType: 'buy',
            orderType: entryTs.order_type || 'market', amountType: entryTs.amount_type || 'percentage',
            amountValue: entryTs.amount_value ?? 100, fee: entryTs.fee ?? 0.1,
            slippage: entryTs.slippage ?? 0.05 } });
    if (settings.entry_node && settingsNodes[settings.entry_node])
        edges.push({ id: `e_${settings.entry_node}_entry`, source: settings.entry_node, target: entryId, targetHandle: 'logic', animated: true, style: edgeStyle });

    // TP/SL column
    let tpslY = strategyY;
    (entryTs.take_profits || []).forEach((tp, i) => {
        const tpId = `rebuilt_tp_${i}`;
        nodes.push({ id: tpId, type: 'takeProfit', position: { x: C5_X, y: tpslY },
            data: { onChange: updateNodeData, onDelete: deleteNode,
                triggerType: tp.type || 'percentage', triggerValue: tp.value ?? '',
                closeType: tp.close_amount_type || 'percentage', closeValue: tp.close_amount_value ?? 100 } });
        edges.push({ id: `e_entry_${tpId}`, source: entryId, sourceHandle: 'tp', target: tpId, animated: true, style: edgeStyle });
        tpslY += SIZE.tp.h + GAP + 10;
    });
    (entryTs.stop_losses || []).forEach((sl, i) => {
        const slId = `rebuilt_sl_${i}`;
        nodes.push({ id: slId, type: 'stopLoss', position: { x: C5_X, y: tpslY },
            data: { onChange: updateNodeData, onDelete: deleteNode,
                triggerType: sl.type || 'percentage', triggerValue: sl.value ?? '',
                closeType: sl.close_amount_type || 'percentage', closeValue: sl.close_amount_value ?? 100 } });
        edges.push({ id: `e_entry_${slId}`, source: entryId, sourceHandle: 'sl', target: slId, animated: true, style: edgeStyle });
        tpslY += SIZE.sl.h + GAP + 10;
    });

    // Exit action below entry
    const exitTs = settings.trade_settings?.exit || {};
    const exitId = 'rebuilt_exit';
    nodes.push({ id: exitId, type: 'action', position: { x: C4_X, y: strategyY + SIZE.action.h + COL_GAP },
        data: { onChange: updateNodeData, onDelete: deleteNode, actionType: 'sell',
            orderType: exitTs.order_type || 'market', amountType: exitTs.amount_type || 'percentage',
            amountValue: exitTs.amount_value ?? 100, fee: exitTs.fee ?? 0.1,
            slippage: exitTs.slippage ?? 0.05 } });
    if (settings.exit_node && settingsNodes[settings.exit_node])
        edges.push({ id: `e_${settings.exit_node}_exit`, source: settings.exit_node, target: exitId, targetHandle: 'logic', animated: true, style: edgeStyle });

    return { nodes, edges };
}

const BotBuilderFlow = ({ closeBuilder, editingBot }) => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [availableKeys, setAvailableKeys] = useState([]);
  
  const [modalConfig, setModalConfig] = useState(null);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [supportedTimeframes, setSupportedTimeframes] = useState(null);

  const initRef = useRef(false);

  const updateNodeData = useCallback((id, field, value) => {
    let safeValue = value;
    // Only coerce numeric fields; leave string fields as-is
    if (field === 'triggerValue' || field === 'closeValue') {
        safeValue = parseSafeFloat(value);
    }

    setNodes((nds) => nds.map((node) => {
        if (node.id === id) { 
            return { ...node, data: { ...node.data, [field]: safeValue } }; 
        }
        return node;
    }));
  }, [setNodes]);

  const deleteNode = useCallback((id) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (initRef.current) return;

    apiClient.get('/api/keys').then(res => {
        const keys = res.data;
        setAvailableKeys(keys);
        setNodes(nds => nds.map(n => {
            if (n.type === 'apiKey') return { ...n, data: { ...n.data, availableKeys: keys } };
            return n;
        }));
    }).catch(() => {});

    const hasLayout = editingBot && editingBot.settings.ui_layout && editingBot.settings.ui_layout.nodes && editingBot.settings.ui_layout.nodes.length > 0;
    if (hasLayout) {
        const restoredNodes = editingBot.settings.ui_layout.nodes.map(n => ({
            ...n, data: { ...n.data, onChange: updateNodeData, onDelete: deleteNode }
        }));
        setNodes(restoredNodes);
        setEdges(editingBot.settings.ui_layout.edges || []);
        initRef.current = true;
    } else if (editingBot && editingBot.settings && Object.keys(editingBot.settings.nodes || {}).length > 0) {
        // Reconstruct visual layout from settings (imported/programmatic bot with no ui_layout)
        const rebuilt = rebuildLayoutFromSettings(editingBot.settings, updateNodeData, deleteNode);
        // Set the bot name on the config node
        const cfgNode = rebuilt.nodes.find(n => n.type === 'botConfig');
        if (cfgNode) cfgNode.data.botName = editingBot.name;
        setNodes(rebuilt.nodes);
        setEdges(rebuilt.edges);
        initRef.current = true;
    } else {
        setNodes([
            { id: getId(), type: 'botConfig', position: { x: 50, y: 50 }, data: { onChange: updateNodeData, onDelete: deleteNode, botName: editingBot ? editingBot.name : 'Apex Strategy Alpha', timeframe: editingBot?.settings?.timeframe || '1m', executionMode: 'paper', maxPositions: 1, maxPositionsScope: 'per_pair', cooldownTrades: 0, cooldownCandles: 0 } },
            { id: getId(), type: 'whitelist', position: { x: 420, y: 50 }, data: { onChange: updateNodeData, onDelete: deleteNode, pairs: editingBot?.settings?.symbols?.join(', ') || editingBot?.settings?.symbol || 'BTC/USDC' } },
            { id: getId(), type: 'backtest', position: { x: 420, y: 240 }, data: { onChange: updateNodeData, onDelete: deleteNode, runOnStart: true, capital: 1000, lookback: 150 } },
            { id: getId(), type: 'apiKey', position: { x: 420, y: 440 }, data: { onChange: updateNodeData, onDelete: deleteNode, apiKeyName: null, dataExchange: 'okx' } }
        ]);
        initRef.current = true;
    }
  }, [editingBot, updateNodeData, deleteNode, setNodes, setEdges]);

  useEffect(() => {
      if (!initRef.current || availableKeys.length === 0) return;
      setNodes(nds => nds.map(n => {
          if (n.type === 'apiKey') {
              return { ...n, data: { ...n.data, availableKeys } };
          }
          return n;
      }));
  }, [availableKeys, setNodes]);

  // Derive active exchange from nodes and fetch supported timeframes
  useEffect(() => {
      if (!initRef.current) return;
      const apiKeyNode = nodes.find(n => n.type === 'apiKey');
      let exchange = apiKeyNode?.data.dataExchange || 'okx';
      if (apiKeyNode?.data.apiKeyName) {
          const keyRecord = availableKeys?.find(k => k.name === apiKeyNode.data.apiKeyName);
          if (keyRecord) exchange = keyRecord.exchange;
      }
      apiClient.get(`/api/data/timeframes/${exchange}`).then(res => {
          setSupportedTimeframes(res.data.timeframes);
      }).catch(() => setSupportedTimeframes(null));
  }, [
      nodes.find(n => n.type === 'apiKey')?.data.apiKeyName,
      nodes.find(n => n.type === 'apiKey')?.data.dataExchange,
      availableKeys
  ]);

  // Pass supported timeframes to config node
  useEffect(() => {
      if (!initRef.current || supportedTimeframes === null) return;
      setNodes(nds => nds.map(n => {
          if (n.type === 'botConfig') return { ...n, data: { ...n.data, supportedTimeframes } };
          return n;
      }));
  }, [supportedTimeframes, setNodes]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#848e9c', strokeWidth: 2 } }, eds)), [setEdges]);
  const onDragOver = useCallback((event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const getDefaultData = useCallback((type) => {
      const defaultData = { onChange: updateNodeData, onDelete: deleteNode };
      if (type === 'apiKey') defaultData.availableKeys = availableKeys;
      if (type === 'indicator') { defaultData.indicator = 'rsi'; defaultData.params = {length: 14}; defaultData.outputIdx = 0; }
      if (type === 'priceData') { defaultData.priceType = 'close'; defaultData.offset = 0; }
      if (type === 'condition') { defaultData.operator = '>'; defaultData.rightValue = ''; }
      if (type === 'logic') defaultData.logicType = 'and';
      if (type === 'botConfig') { defaultData.botName = 'My Bot'; defaultData.timeframe = '1m'; defaultData.executionMode = 'paper'; defaultData.maxPositions = 1; defaultData.maxPositionsScope = 'per_pair'; defaultData.cooldownTrades = 0; defaultData.cooldownCandles = 0; }
      if (type === 'whitelist') defaultData.pairs = 'BTC/USDT';
      if (type === 'backtest') { defaultData.runOnStart = true; defaultData.capital = 1000; defaultData.lookback = 150; }
      if (type === 'stopLoss' || type === 'takeProfit') {
          defaultData.triggerType = 'percentage'; defaultData.triggerValue = '';
          defaultData.closeType = 'percentage'; defaultData.closeValue = 100;
      }
      if (type === 'action') {
          defaultData.actionType = 'buy';
          defaultData.orderType = 'market';
          defaultData.amountType = 'percentage';
          defaultData.amountValue = 100;
          defaultData.slippage = 0.05;
          defaultData.fee = 0.1;
      }
      return defaultData;
  }, [updateNodeData, deleteNode, availableKeys]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode = { id: getId(), type, position, data: getDefaultData(type) };
      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, getDefaultData, setNodes]
  );

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddNodeMobile = (type) => {
      if (window.innerWidth >= 768) return; 
      const position = reactFlowInstance 
          ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
          : { x: 50, y: 150 };
      const newNode = { id: getId(), type, position, data: getDefaultData(type) };
      setNodes((nds) => [...nds, newNode]);
      setToolboxOpen(false);
  };

  const showError = (msg) => {
      setModalConfig({ type: 'danger', title: 'Compile Error', message: msg, confirmText: 'OK', onConfirm: () => setModalConfig(null) });
  };

  const handleSaveAndCompile = async () => {
    try {
        const configNode = nodes.find(n => n.type === 'botConfig');
        const whitelistNode = nodes.find(n => n.type === 'whitelist');
        const backtestNode = nodes.find(n => n.type === 'backtest');
        const apiKeyNode = nodes.find(n => n.type === 'apiKey');
        const apiKeyName = apiKeyNode?.data.apiKeyName || null;
        const apiKeyRecord = apiKeyName ? availableKeys?.find(k => k.name === apiKeyName) : null;
        const dataExchange = apiKeyRecord?.exchange || apiKeyNode?.data.dataExchange || 'okx';

        if (!configNode) return showError("Missing 'Main Configuration' block.");
        if (!whitelistNode) return showError("Missing 'Asset Whitelist' block.");

        const symbolsList = whitelistNode.data.pairs.split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (symbolsList.length === 0) return showError("Whitelist must contain at least one pair.");

        // Strip non-serialisable function refs and runtime keys before persisting
        const uiNodesSafe = nodes.map(n => {
            const safeNode = { ...n, data: { ...n.data } };
            delete safeNode.data.onChange;
            delete safeNode.data.onDelete;
            delete safeNode.data.availableKeys;
            return safeNode;
        });

        const payload = {
            name: configNode.data.botName || "Untitled Algorithm",
            is_active: false,
            is_sandbox: true,
            settings: {
                symbol: symbolsList[0], 
                symbols: symbolsList,   
                timeframe: configNode.data.timeframe || "1m",
                max_positions: configNode.data.maxPositions || 1,
                max_positions_scope: configNode.data.maxPositionsScope || 'per_pair',
                cooldown_trades: configNode.data.cooldownTrades || 0,
                cooldown_candles: configNode.data.cooldownCandles || 0,
                max_drawdown: configNode.data.maxDrawdown || 0,
                max_order_value: configNode.data.maxOrderValue || 0,
                api_execution: configNode.data.executionMode === 'exchange',
                backtest_on_start: backtestNode ? backtestNode.data.runOnStart : false,
                backtest_capital: backtestNode ? backtestNode.data.capital : 1000,
                backtest_lookback: backtestNode ? (backtestNode.data.lookback || 150) : 150,
                api_key_name: apiKeyName,
                data_exchange: dataExchange,
                trade_settings: {}, 
                nodes: {},
                ui_layout: {
                    nodes: uiNodesSafe, 
                    edges: edges
                }
            }
        };

        nodes.forEach(n => {
            if (n.type === 'indicator') {
                payload.settings.nodes[n.id] = { 
                    class: "indicator", 
                    method: n.data.indicator || 'rsi', 
                    params: n.data.params || { length: 14 }, 
                    output_idx: n.data.outputIdx || 0 
                };
            }
        });

        const entryNode = nodes.find(n => n.type === 'action' && n.data.actionType === 'buy');
        const exitNode = nodes.find(n => n.type === 'action' && n.data.actionType === 'sell');

        if (entryNode) {
             const tpEdges = edges.filter(e => e.source === entryNode.id && e.sourceHandle === 'tp');
             const slEdges = edges.filter(e => e.source === entryNode.id && e.sourceHandle === 'sl');

             payload.settings.trade_settings.entry = {
                 order_type: entryNode.data.orderType || 'market',
                 amount_type: entryNode.data.amountType || 'percentage',
                 amount_value: entryNode.data.amountValue !== undefined && entryNode.data.amountValue !== "" ? entryNode.data.amountValue : 100,
                 fee: entryNode.data.fee !== undefined && entryNode.data.fee !== "" ? entryNode.data.fee : 0.1,
                 slippage: entryNode.data.slippage !== undefined && entryNode.data.slippage !== "" ? entryNode.data.slippage : 0.05,
                 take_profits: tpEdges.map(e => {
                     const n = nodes.find(nd => nd.id === e.target);
                     if(!n) return null;
                     return { type: n.data.triggerType, value: parseFloat(n.data.triggerValue) || 0, close_amount_type: n.data.closeType, close_amount_value: parseFloat(n.data.closeValue) || 100 };
                 }).filter(Boolean),
                 stop_losses: slEdges.map(e => {
                     const n = nodes.find(nd => nd.id === e.target);
                     if(!n) return null;
                     return { type: n.data.triggerType, value: parseFloat(n.data.triggerValue) || 0, close_amount_type: n.data.closeType, close_amount_value: parseFloat(n.data.closeValue) || 100 };
                 }).filter(Boolean)
             };
        }
        
        if (exitNode) {
            payload.settings.trade_settings.exit = {
                order_type: exitNode.data.orderType || 'market',
                amount_type: exitNode.data.amountType || 'percentage',
                amount_value: exitNode.data.amountValue !== undefined && exitNode.data.amountValue !== "" ? exitNode.data.amountValue : 100,
                fee: exitNode.data.fee !== undefined && exitNode.data.fee !== "" ? exitNode.data.fee : 0.1,
                slippage: exitNode.data.slippage !== undefined && exitNode.data.slippage !== "" ? exitNode.data.slippage : 0.05
            };
        }

        const traverse = (targetId) => {
            const incomingEdge = edges.find(e => e.target === targetId && (e.targetHandle === 'logic' || e.targetHandle === 'left' || e.targetHandle === 'in1' || !e.targetHandle));
            if (!incomingEdge) return null;
            
            const sourceNode = nodes.find(n => n.id === incomingEdge.source);
            if (!sourceNode) return null;

            if (sourceNode.type === 'indicator') {
                const params = sourceNode.data.params || { length: sourceNode.data.period || 14 };
                payload.settings.nodes[sourceNode.id] = { class: "indicator", method: sourceNode.data.indicator || 'rsi', params: params, output_idx: sourceNode.data.outputIdx || 0 };
                return sourceNode.id;
            }
            if (sourceNode.type === 'priceData') {
                payload.settings.nodes[sourceNode.id] = { class: "price_data", type: sourceNode.data.priceType || "close", offset: sourceNode.data.offset || 0 };
                return sourceNode.id;
            }
            if (sourceNode.type === 'condition') {
                const leftEdge = edges.find(e => e.target === sourceNode.id && (e.targetHandle === 'left' || !e.targetHandle));
                const rightEdge = edges.find(e => e.target === sourceNode.id && e.targetHandle === 'right');
                
                payload.settings.nodes[sourceNode.id] = { 
                    class: "condition", 
                    left: leftEdge ? traverseByEdge(leftEdge) : null, 
                    operator: sourceNode.data.operator || ">", 
                    right: rightEdge ? traverseByEdge(rightEdge) : (sourceNode.data.rightValue !== undefined && sourceNode.data.rightValue !== "" ? sourceNode.data.rightValue : null) 
                };
                return sourceNode.id;
            }
            if (sourceNode.type === 'logic') {
                const incomingEdges = edges.filter(e => e.target === sourceNode.id);
                payload.settings.nodes[sourceNode.id] = { 
                    class: "logic", 
                    operator: sourceNode.data.logicType || "and", 
                    left: incomingEdges.length > 0 ? traverseByEdge(incomingEdges[0]) : null, 
                    right: sourceNode.data.logicType === "not" ? null : (incomingEdges.length > 1 ? traverseByEdge(incomingEdges[1]) : null) 
                };
                return sourceNode.id;
            }
            return null;
        };

        const traverseByEdge = (edge) => {
             const sourceNode = nodes.find(n => n.id === edge.source);
             if(!sourceNode) return null;
             if (sourceNode.type === 'indicator') { 
                 const params = sourceNode.data.params || { length: sourceNode.data.period || 14 };
                 payload.settings.nodes[sourceNode.id] = { class: "indicator", method: sourceNode.data.indicator || 'rsi', params: params, output_idx: sourceNode.data.outputIdx || 0 }; 
                 return sourceNode.id; 
             }
             if (sourceNode.type === 'priceData') { payload.settings.nodes[sourceNode.id] = { class: "price_data", type: sourceNode.data.priceType || "close", offset: sourceNode.data.offset || 0 }; return sourceNode.id; }
             if (sourceNode.type === 'condition') { 
                 const leftEdge = edges.find(e => e.target === sourceNode.id && (e.targetHandle === 'left' || !e.targetHandle));
                 const rightEdge = edges.find(e => e.target === sourceNode.id && e.targetHandle === 'right');
                 payload.settings.nodes[sourceNode.id] = { 
                     class: "condition", 
                     left: leftEdge ? traverseByEdge(leftEdge) : null, 
                     operator: sourceNode.data.operator || ">", 
                     right: rightEdge ? traverseByEdge(rightEdge) : (sourceNode.data.rightValue !== undefined && sourceNode.data.rightValue !== "" ? sourceNode.data.rightValue : null) 
                 }; 
                 return sourceNode.id; 
             }
             if (sourceNode.type === 'logic') {
                 const incomingEdges = edges.filter(e => e.target === sourceNode.id);
                 payload.settings.nodes[sourceNode.id] = { 
                     class: "logic", 
                     operator: sourceNode.data.logicType || "and", 
                     left: incomingEdges.length > 0 ? traverseByEdge(incomingEdges[0]) : null, 
                     right: sourceNode.data.logicType === "not" ? null : (incomingEdges.length > 1 ? traverseByEdge(incomingEdges[1]) : null) 
                 };
                 return sourceNode.id;
             }
             return null;
        };

        if (entryNode) payload.settings.entry_node = traverse(entryNode.id);
        if (exitNode) payload.settings.exit_node = traverse(exitNode.id);

        const hasLogic = !!payload.settings.entry_node;

        if (editingBot) {
            await apiClient.put(`/api/bots/${editingBot.id}`, { name: payload.name, settings: payload.settings });
            setModalConfig({
                type: hasLogic ? 'success' : 'warning',
                title: hasLogic ? 'Success' : 'Draft Saved',
                message: hasLogic ? 'Algorithm Configuration Updated.' : 'Your draft is saved, but has no logic yet. The engine will ignore it until you connect an Entry signal.',
                confirmText: 'OK',
                onConfirm: () => { setModalConfig(null); closeBuilder(); }
            });
        } else {
            await apiClient.post('/api/bots/', payload);
            setModalConfig({
                type: hasLogic ? 'success' : 'warning',
                title: hasLogic ? 'Compiled' : 'Draft Saved',
                message: hasLogic ? 'Algorithm Successfully Compiled & Deployed.' : 'Your draft is saved, but has no logic yet. The engine will ignore it until you connect an Entry signal.',
                confirmText: 'OK',
                onConfirm: () => { setModalConfig(null); closeBuilder(); }
            });
        }

    } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail
            : detail?.validation_errors ? detail.validation_errors.join('\n')
            : err.message;
        showError(msg);
    }
  };

  return (
    <div className="flex w-full h-[100dvh] bg-[#080a0f] absolute inset-0 z-[100] fade-in flex-col md:flex-row">

      <Modal config={modalConfig} />

      {/* Mobile header */}
      <div className="md:hidden flex h-14 bg-[#12151c]/80 backdrop-blur-xl border-b border-[#202532] items-center justify-between px-4 shrink-0 z-50">
          <button onClick={() => setToolboxOpen(true)} className="flex items-center text-[#fcd535] font-bold uppercase text-[10px] tracking-wider bg-[#fcd535]/10 px-3 py-1.5 rounded-lg border border-[#fcd535]/30">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              Toolbox
          </button>
          <div className="flex space-x-3 items-center">
              <button onClick={closeBuilder} className="text-[#848e9c] hover:text-[#f6465d] font-bold uppercase text-[10px] tracking-wider px-2 py-1.5 transition-colors">Close</button>
              <button onClick={handleSaveAndCompile} className="bg-[#fcd535] text-[#181a20] px-4 py-1.5 rounded-lg font-bold uppercase text-[10px] tracking-wider shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.25)] hover:bg-[#e5c02a] transition-all duration-200">Save</button>
          </div>
      </div>

      {/* Mobile overlay backdrop for toolbox */}
      {toolboxOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[105] md:hidden fade-in" onClick={() => setToolboxOpen(false)}></div>}

      {/* Left sidebar / toolbox — slides in from the left on mobile */}
      <div className={`fixed md:static inset-y-0 left-0 z-[110] w-72 bg-[#12151c]/95 backdrop-blur-xl border-r border-[#202532] flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${toolboxOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 h-[100dvh]`}>
        <div className="relative p-4 border-b border-[#202532] bg-[#080a0f]/50 flex justify-between items-center md:block overflow-hidden">
          <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full blur-[60px] bg-[#fcd535]/5 pointer-events-none" />
          <div className="relative">
            <h2 className="text-[#eaecef] font-bold tracking-wider text-lg">APEX<span className="text-[#fcd535]">ALGO</span></h2>
            <span className="text-[10px] text-[#848e9c] uppercase tracking-widest">{editingBot ? 'Editing Architecture' : 'Algorithm Builder'}</span>
          </div>
          <button onClick={() => setToolboxOpen(false)} className="md:hidden text-[#848e9c] hover:text-white p-2 font-bold text-lg transition-colors">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar pb-24 md:pb-5">
            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#202532] pb-1">1. Setup & Context</span>
                <div className="p-3 bg-[#080a0f] border border-[#8b5cf6]/50 rounded-lg text-[11px] text-[#8b5cf6] font-bold cursor-pointer md:cursor-grab hover:bg-[#8b5cf6]/10 transition-colors uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'botConfig')} onClick={() => handleAddNodeMobile('botConfig')} draggable>Main Configuration</div>
                <div className="p-3 bg-[#080a0f] border border-[#d946ef]/50 rounded-lg text-[11px] text-[#d946ef] font-bold cursor-pointer md:cursor-grab hover:bg-[#d946ef]/10 transition-colors uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'whitelist')} onClick={() => handleAddNodeMobile('whitelist')} draggable>Asset Whitelist</div>
                <div className="p-3 bg-[#080a0f] border border-[#fcd535]/50 rounded-lg text-[11px] text-[#fcd535] font-bold cursor-pointer md:cursor-grab hover:bg-[#fcd535]/10 transition-colors uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'backtest')} onClick={() => handleAddNodeMobile('backtest')} draggable>Backtest Engine</div>
                <div className="p-3 bg-[#080a0f] border border-[#0ea5e9]/50 rounded-lg text-[11px] text-[#0ea5e9] font-bold cursor-pointer md:cursor-grab hover:bg-[#0ea5e9]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'apiKey')} onClick={() => handleAddNodeMobile('apiKey')} draggable>Exchange Routing</div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#202532] pb-1">2. Market Logic</span>
                <div className="p-3 bg-[#080a0f] border border-[#202532] rounded-lg text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#202532]/50 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'indicator')} onClick={() => handleAddNodeMobile('indicator')} draggable>Technical Indicator</div>
                <div className="p-3 bg-[#080a0f] border border-[#202532] rounded-lg text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#202532]/50 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'priceData')} onClick={() => handleAddNodeMobile('priceData')} draggable>Price Data</div>
                <div className="p-3 bg-[#080a0f] border border-[#202532] rounded-lg text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#202532]/50 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'condition')} onClick={() => handleAddNodeMobile('condition')} draggable>Data Condition</div>
                <div className="p-3 bg-[#080a0f] border border-[#2ea043]/50 rounded text-[11px] text-[#2ea043] font-bold cursor-pointer md:cursor-grab hover:bg-[#2ea043]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'logic')} onClick={() => handleAddNodeMobile('logic')} draggable>Logic Gate (AND, OR, NOT)</div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#202532] pb-1">3. Risk Management</span>
                <div className="p-3 bg-[#080a0f] border border-[#2ebd85]/50 rounded text-[11px] text-[#2ebd85] font-bold cursor-pointer md:cursor-grab hover:bg-[#2ebd85]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'takeProfit')} onClick={() => handleAddNodeMobile('takeProfit')} draggable>Take Profit (Target)</div>
                <div className="p-3 bg-[#080a0f] border border-[#f6465d]/50 rounded text-[11px] text-[#f6465d] font-bold cursor-pointer md:cursor-grab hover:bg-[#f6465d]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'stopLoss')} onClick={() => handleAddNodeMobile('stopLoss')} draggable>Stop Loss (Risk)</div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#202532] pb-1">4. Execution</span>
                <div className="p-3 bg-[#080a0f] border border-[#eaecef]/20 rounded text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#eaecef]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'action')} onClick={() => handleAddNodeMobile('action')} draggable>Action Routing</div>
            </div>
        </div>

        <div className="hidden md:flex p-5 border-t border-[#202532] space-x-3 bg-[#080a0f]/50 shrink-0">
             <button onClick={closeBuilder} className="flex-1 bg-[#202532] text-[#eaecef] text-xs font-bold py-2.5 rounded-lg hover:bg-[#2b3545] transition-all duration-200 uppercase tracking-wider">Close</button>
             <button onClick={handleSaveAndCompile} className="flex-1 bg-[#fcd535] text-[#181a20] text-xs font-bold py-2.5 rounded-lg hover:bg-[#e5c02a] transition-all duration-200 shadow-[0_0_15px_rgba(252,213,53,0.15)] hover:shadow-[0_0_25px_rgba(252,213,53,0.25)] uppercase tracking-wider">{editingBot ? 'Update' : 'Save Bot'}</button>
        </div>
      </div>

      {/* REACT FLOW CANVAS */}
      <div className="flex-1 w-full h-full relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={setReactFlowInstance}
          fitView
          attributionPosition="bottom-right"
        >
          <Background color="#1f2329" gap={20} size={2} />
          {/* Offset controls upward on mobile to clear the bottom nav bar */}
          <Controls style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#12151c', border: '1px solid #202532', borderRadius: '8px', overflow: 'hidden', position: 'absolute', bottom: window.innerWidth < 768 ? '70px' : '20px', left: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }} />
          <MiniMap nodeColor={() => '#848e9c'} maskColor="#080a0f" style={{ backgroundColor: '#12151c', border: '1px solid #202532', borderRadius: '8px', display: window.innerWidth < 768 ? 'none' : 'block', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }} />
        </ReactFlow>
      </div>
    </div>
  );
};

export default React.memo(function BotBuilderWrapper(props) {
  return (
    <ReactFlowProvider>
      <BotBuilderFlow {...props} />
    </ReactFlowProvider>
  );
});