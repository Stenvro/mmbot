import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { BotConfigNode, WhitelistNode, BacktestNode, ApiKeyNode, IndicatorNode, ConditionNode, LogicNode, StopLossNode, TakeProfitNode, ActionNode, PriceDataNode } from './CustomNodes';
import { apiClient } from '../../api/client';

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

// Veilige parser die alleen de trigger/close values hard forceert naar numbers, 
// maar strings met rust laat voor de rest.
const parseSafeFloat = (val) => {
    if (val === "" || val === undefined || val === null) return "";
    const parsed = parseFloat(String(val).replace(',', '.'));
    return isNaN(parsed) ? "" : parsed;
};

const BotBuilderFlow = ({ closeBuilder, editingBot }) => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [availableKeys, setAvailableKeys] = useState([]);
  
  const [modalConfig, setModalConfig] = useState(null);
  const [toolboxOpen, setToolboxOpen] = useState(false); 
  
  const initRef = useRef(false);

  const updateNodeData = useCallback((id, field, value) => {
    let safeValue = value;
    // Forceer alleen floating numbers voor risk blocks.
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

    if (editingBot && editingBot.settings.ui_layout) {
        const restoredNodes = editingBot.settings.ui_layout.nodes.map(n => ({
            ...n, data: { ...n.data, onChange: updateNodeData, onDelete: deleteNode }
        }));
        setNodes(restoredNodes);
        setEdges(editingBot.settings.ui_layout.edges || []);
        initRef.current = true;
    } else if (!editingBot) {
        setNodes([
            { id: getId(), type: 'botConfig', position: { x: 50, y: 50 }, data: { onChange: updateNodeData, onDelete: deleteNode, botName: 'Apex Strategy Alpha', timeframe: '1m', executionMode: 'paper', maxPositions: 1, maxPositionsScope: 'per_pair', cooldownTrades: 0, cooldownCandles: 0 } },
            // FIX: Startpositie X flink opgeschoven naar 600 zodat brede blokken niet meer overlappen
            { id: getId(), type: 'whitelist', position: { x: 500, y: 50 }, data: { onChange: updateNodeData, onDelete: deleteNode, pairs: 'BTC/USDC' } }
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

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#848e9c', strokeWidth: 2 } }, eds)), [setEdges]);
  const onDragOver = useCallback((event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const getDefaultData = (type) => {
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
  };

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode = { id: getId(), type, position, data: getDefaultData(type) };
      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, availableKeys, updateNodeData, deleteNode, setNodes]
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
      setModalConfig({ type: 'error', title: 'Compile Error', message: msg, onConfirm: () => setModalConfig(null) });
  };

  const handleSaveAndCompile = async () => {
    try {
        const configNode = nodes.find(n => n.type === 'botConfig');
        const whitelistNode = nodes.find(n => n.type === 'whitelist');
        const backtestNode = nodes.find(n => n.type === 'backtest');
        const apiKeyNode = nodes.find(n => n.type === 'apiKey');

        if (!configNode) return showError("Missing 'Main Configuration' block.");
        if (!whitelistNode) return showError("Missing 'Asset Whitelist' block.");

        const symbolsList = whitelistNode.data.pairs.split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (symbolsList.length === 0) return showError("Whitelist must contain at least one pair.");

        // We ontdoen de nodes van functies en keys voor opslag
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
                api_execution: configNode.data.executionMode === 'exchange',
                backtest_on_start: backtestNode ? backtestNode.data.runOnStart : false,
                backtest_capital: backtestNode ? backtestNode.data.capital : 1000,
                backtest_lookback: backtestNode ? (backtestNode.data.lookback || 150) : 150,
                api_key_name: apiKeyNode ? apiKeyNode.data.apiKeyName : null,
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
                onConfirm: () => { setModalConfig(null); closeBuilder(); } 
            });
        } else {
            await apiClient.post('/api/bots/', payload);
            setModalConfig({ 
                type: hasLogic ? 'success' : 'warning', 
                title: hasLogic ? 'Compiled' : 'Draft Saved', 
                message: hasLogic ? 'Algorithm Successfully Compiled & Deployed.' : 'Your draft is saved, but has no logic yet. The engine will ignore it until you connect an Entry signal.', 
                onConfirm: () => { setModalConfig(null); closeBuilder(); } 
            });
        }

    } catch (err) {
        console.error(err);
        showError(err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="flex w-full h-[100dvh] bg-[#0b0e11] absolute inset-0 z-[100] fade-in flex-col md:flex-row">
      
      {modalConfig && (
        <div className="fixed inset-0 z-[9999] bg-[#0b0e11]/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
          <div className="bg-[#181a20] border border-[#2b3139] rounded shadow-2xl max-w-sm w-full p-6 relative">
            <h3 className={`text-lg font-bold mb-2 uppercase tracking-wider ${modalConfig.type === 'success' ? 'text-[#2ebd85]' : modalConfig.type === 'warning' ? 'text-[#fcd535]' : 'text-[#f6465d]'}`}>
              {modalConfig.title}
            </h3>
            <p className="text-[#848e9c] text-sm mb-6 leading-relaxed">{modalConfig.message}</p>
            <div className="flex justify-end">
              <button onClick={modalConfig.onConfirm} className={`px-6 py-2 rounded text-xs font-bold uppercase transition-colors ${modalConfig.type === 'success' ? 'bg-[#2ebd85] hover:bg-[#2ebd85]/80 text-[#181a20]' : modalConfig.type === 'warning' ? 'bg-[#fcd535] hover:bg-[#e5c02a] text-[#181a20]' : 'bg-[#f6465d] hover:bg-[#f6465d]/80 text-white'}`}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MOBIELE HEADER (Enkel zichtbaar op mobiel) --- */}
      <div className="md:hidden flex h-14 bg-[#181a20] border-b border-[#2b3139] items-center justify-between px-4 shrink-0 z-50">
          <button onClick={() => setToolboxOpen(true)} className="flex items-center text-[#fcd535] font-bold uppercase text-[10px] tracking-wider bg-[#fcd535]/10 px-3 py-1.5 rounded border border-[#fcd535]/30">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              Toolbox
          </button>
          <div className="flex space-x-3 items-center">
              <button onClick={closeBuilder} className="text-[#848e9c] hover:text-[#f6465d] font-bold uppercase text-[10px] tracking-wider px-2 py-1.5">Close</button>
              <button onClick={handleSaveAndCompile} className="bg-[#fcd535] text-[#181a20] px-4 py-1.5 rounded font-bold uppercase text-[10px] tracking-wider shadow-sm">Save</button>
          </div>
      </div>

      {/* --- MOBIELE OVERLAY VOOR TOOLBOX --- */}
      {toolboxOpen && <div className="fixed inset-0 bg-black/60 z-[105] md:hidden fade-in" onClick={() => setToolboxOpen(false)}></div>}

      {/* LEFT SIDEBAR / TOOLBOX (Op mobiel verbergt deze zich achter de zijkant) */}
      <div className={`fixed md:static inset-y-0 left-0 z-[110] w-72 bg-[#181a20] border-r border-[#2b3139] flex flex-col shadow-2xl md:shadow-lg transform transition-transform duration-300 ease-in-out ${toolboxOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 h-[100dvh]`}>
        <div className="p-4 border-b border-[#2b3139] bg-[#0b0e11]/50 flex justify-between items-center md:block">
          <div>
            <h2 className="text-[#eaecef] font-bold tracking-wider text-lg">APEX<span className="text-[#fcd535]">ALGO</span></h2>
            <span className="text-[10px] text-[#848e9c] uppercase tracking-widest">{editingBot ? 'Editing Architecture' : 'Algorithm Builder'}</span>
          </div>
          <button onClick={() => setToolboxOpen(false)} className="md:hidden text-[#848e9c] hover:text-white p-2 font-bold text-lg">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar pb-24 md:pb-5">
            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#2b3139] pb-1">1. Setup & Context</span>
                <div className="p-3 bg-[#0b0e11] border border-[#8b5cf6]/50 rounded text-[11px] text-[#8b5cf6] font-bold cursor-pointer md:cursor-grab hover:bg-[#8b5cf6]/10 transition-colors uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'botConfig')} onClick={() => handleAddNodeMobile('botConfig')} draggable>Main Configuration</div>
                <div className="p-3 bg-[#0b0e11] border border-[#d946ef]/50 rounded text-[11px] text-[#d946ef] font-bold cursor-pointer md:cursor-grab hover:bg-[#d946ef]/10 transition-colors uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'whitelist')} onClick={() => handleAddNodeMobile('whitelist')} draggable>Asset Whitelist</div>
                <div className="p-3 bg-[#0b0e11] border border-[#fcd535]/50 rounded text-[11px] text-[#fcd535] font-bold cursor-pointer md:cursor-grab hover:bg-[#fcd535]/10 transition-colors uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'backtest')} onClick={() => handleAddNodeMobile('backtest')} draggable>Backtest Engine</div>
                <div className="p-3 bg-[#0b0e11] border border-[#0ea5e9]/50 rounded text-[11px] text-[#0ea5e9] font-bold cursor-pointer md:cursor-grab hover:bg-[#0ea5e9]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'apiKey')} onClick={() => handleAddNodeMobile('apiKey')} draggable>Exchange Routing</div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#2b3139] pb-1">2. Market Logic</span>
                <div className="p-3 bg-[#0b0e11] border border-[#2b3139] rounded text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#2b3139]/50 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'indicator')} onClick={() => handleAddNodeMobile('indicator')} draggable>Technical Indicator</div>
                <div className="p-3 bg-[#0b0e11] border border-[#3b4149] rounded text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#3b4149]/50 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'priceData')} onClick={() => handleAddNodeMobile('priceData')} draggable>Price Data</div>
                <div className="p-3 bg-[#0b0e11] border border-[#3b4149] rounded text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#3b4149]/50 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'condition')} onClick={() => handleAddNodeMobile('condition')} draggable>Data Condition</div>
                <div className="p-3 bg-[#0b0e11] border border-[#2ea043]/50 rounded text-[11px] text-[#2ea043] font-bold cursor-pointer md:cursor-grab hover:bg-[#2ea043]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'logic')} onClick={() => handleAddNodeMobile('logic')} draggable>Logic Gate (AND, OR, NOT)</div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#2b3139] pb-1">3. Risk Management</span>
                <div className="p-3 bg-[#0b0e11] border border-[#2ebd85]/50 rounded text-[11px] text-[#2ebd85] font-bold cursor-pointer md:cursor-grab hover:bg-[#2ebd85]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'takeProfit')} onClick={() => handleAddNodeMobile('takeProfit')} draggable>Take Profit (Target)</div>
                <div className="p-3 bg-[#0b0e11] border border-[#f6465d]/50 rounded text-[11px] text-[#f6465d] font-bold cursor-pointer md:cursor-grab hover:bg-[#f6465d]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'stopLoss')} onClick={() => handleAddNodeMobile('stopLoss')} draggable>Stop Loss (Risk)</div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider block border-b border-[#2b3139] pb-1">4. Execution</span>
                <div className="p-3 bg-[#0b0e11] border border-[#eaecef]/20 rounded text-[11px] text-[#eaecef] font-bold cursor-pointer md:cursor-grab hover:bg-[#eaecef]/10 transition-colors shadow-sm uppercase tracking-wider" onDragStart={(event) => onDragStart(event, 'action')} onClick={() => handleAddNodeMobile('action')} draggable>Action Routing</div>
            </div>
        </div>

        <div className="hidden md:flex p-5 border-t border-[#2b3139] space-x-3 bg-[#0b0e11]/50 shrink-0">
             <button onClick={closeBuilder} className="flex-1 bg-[#2b3139] text-[#eaecef] text-xs font-bold py-2.5 rounded hover:bg-[#3b4149] transition-colors uppercase tracking-wider">Close</button>
             <button onClick={handleSaveAndCompile} className="flex-1 bg-[#fcd535] text-[#181a20] text-xs font-bold py-2.5 rounded hover:bg-[#e5c02a] transition-colors shadow-sm uppercase tracking-wider">{editingBot ? 'Update' : 'Save Bot'}</button>
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
          {/* Op mobiel de controls wat omhoog zodat de menubalk niet in de weg zit */}
          <Controls style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#181a20', border: '1px solid #2b3139', borderRadius: '4px', overflow: 'hidden', position: 'absolute', bottom: window.innerWidth < 768 ? '70px' : '20px', left: '20px' }} />
          <MiniMap nodeColor={(node) => '#848e9c'} maskColor="#0b0e11" style={{ backgroundColor: '#181a20', border: '1px solid #2b3139', borderRadius: '4px', display: window.innerWidth < 768 ? 'none' : 'block' }} />
        </ReactFlow>
      </div>
    </div>
  );
};

export default function BotBuilderWrapper(props) {
  return (
    <ReactFlowProvider>
      <BotBuilderFlow {...props} />
    </ReactFlowProvider>
  );
}