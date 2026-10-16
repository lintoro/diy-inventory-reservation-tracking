/**
 * BOM 木桶短板與款式花色總量池運算引擎 (03_BOMCalculator.js)
 */

/**
 * 計算全產品之可接單上限與木桶短板分析
 * @param {Array<Object>} [inventoryList] 29項核心庫存 (若無則自動取用 getEffectiveInventory())
 * @returns {Object} 包含各商品可做套數與短板分析
 */
function calculateProductCapacities(inventoryList) {
  const stockList = inventoryList || getEffectiveInventory();
  
  // 建立快速查詢 map: itemCode -> item, category -> items[]
  const itemMap = {};
  const catMap = {};

  stockList.forEach(item => {
    itemMap[item.itemCode] = item;
    if (!catMap[item.category]) {
      catMap[item.category] = [];
    }
    catMap[item.category].push(item);
  });

  // 輔助函式：取得某材料種類或品號的總庫存
  function getCategoryTotalQty(category) {
    let items = catMap[category] || [];
    if (items.length === 0 && itemMap[category]) {
      items = [itemMap[category]];
    }
    return items.reduce((sum, it) => sum + (Number(it.effectiveQty) || 0), 0);
  }

  // 輔助函式：取得某材料種類或品號的完整庫存統計 (生效在庫、ERP帳面數、現場盤點數、在途未到貨補貨)
  function getCategoryStats(category) {
    let items = catMap[category] || [];
    if (items.length === 0 && itemMap[category]) {
      items = [itemMap[category]];
    }
    let effectiveSum = 0;
    let erpSum = 0;
    let cycleCountSum = 0;
    let hasCount = false;
    let incomingList = [];

    items.forEach(it => {
      effectiveSum += (Number(it.effectiveQty) || 0);
      erpSum += (Number(it.erpQty) || 0);
      if (it.hasCountToday) {
        hasCount = true;
        cycleCountSum += (Number(it.cycleCountQty !== undefined && it.cycleCountQty !== null ? it.cycleCountQty : it.effectiveQty) || 0);
      }
      if (it.incomingSupplies && Array.isArray(it.incomingSupplies)) {
        incomingList = incomingList.concat(it.incomingSupplies);
      }
    });

    return {
      category: category,
      effectiveTotal: effectiveSum,
      erpTotal: erpSum,
      hasCycleCount: hasCount,
      cycleCountTotal: hasCount ? cycleCountSum : null,
      source: hasCount ? "現場實盤優先" : "未更動 (沿用系統)",
      incomingSupplies: incomingList
    };
  }

  // 輔助函式：將 (o色總量池)、(o款共用)、(o款共同) 等具體種類寫死的標記，統一正規化為 (共用總量)
  function normalizeSharedPoolLabel(str) {
    if (!str) return "";
    return String(str).replace(/\([0-9\u4e00-\u9fa5a-zA-Z]*[色款種]?(總量池|共用|共同|共用料)\)/g, "(共用總量)");
  }

  // 輔助產生下單提醒文字
  const today = new Date();
  const deadlineDate = new Date(today.getTime() + (CONFIG.LEAD_TIME_DAYS * 24 * 60 * 60 * 1000));
  const deadlineStr = Utilities.formatDate(deadlineDate, "Asia/Taipei", "yyyy/MM/dd");

  function buildPartInfo(name, req, statsOrPool, poss, isBtl) {
    let action = "🟢 庫存充足";
    let statusClass = "text-green";
    if (poss <= 20) {
      if (isBtl) {
        action = `🔴 短板缺料！最晚下單：${deadlineStr}`;
        statusClass = "text-red";
      } else {
        action = "🟡 庫存偏低 (接近保底)";
        statusClass = "text-yellow";
      }
    } else if (poss <= 50) {
      action = "🟡 水位注意 (可規劃叫貨)";
      statusClass = "text-yellow";
    } else {
      action = "🟢 庫存充足";
      statusClass = "text-green";
    }

    const isObj = (typeof statsOrPool === "object" && statsOrPool !== null);
    const pool = isObj ? statsOrPool.effectiveTotal : statsOrPool;
    const erpQty = isObj ? statsOrPool.erpTotal : pool;
    const hasCount = isObj ? !!statsOrPool.hasCycleCount : false;
    const cycleCountQty = (isObj && hasCount) ? statsOrPool.cycleCountTotal : null;
    const source = isObj ? statsOrPool.source : "系統數字";
    const incomingSupplies = (isObj && statsOrPool.incomingSupplies) ? statsOrPool.incomingSupplies : [];

    return {
      name: normalizeSharedPoolLabel(name),
      requiredPerUnit: req,
      poolTotal: pool,
      erpQty: erpQty,
      hasCycleCount: hasCount,
      cycleCountQty: cycleCountQty,
      source: source,
      possibleUnits: poss,
      isBottleneck: isBtl,
      suggestedAction: action,
      statusClass: statusClass,
      incomingSupplies: incomingSupplies
    };
  }

  const results = {};

  // 0. 優先載入動態商品主檔與 BOM 配方 (由 03_BOM配方設定表 驅動)
  let allProducts = [];
  let allRules = [];
  const prodBomMap = {};
  try {
    const dynConfig = getDynamicProductsAndBOM();
    allProducts = dynConfig.products || [];
    allRules = dynConfig.bomRules || [];
    allRules.forEach(r => {
      const pid = String(r.productId);
      if (!prodBomMap[pid]) prodBomMap[pid] = [];
      prodBomMap[pid].push(r);
    });
  } catch (e) {
    allProducts = CONFIG.PRODUCTS;
    allRules = CONFIG.BOM_RULES;
    allRules.forEach(r => {
      const pid = String(r.productId);
      if (!prodBomMap[pid]) prodBomMap[pid] = [];
      prodBomMap[pid].push(r);
    });
  }

  // 1. 手能生巧
  const toolQty = getCategoryTotalQty("手能生巧");
  results["1"] = {
    productId: "1",
    productName: "手能生巧",
    maxCapacity: toolQty,
    bottleneckCategory: "手能生巧 (HTB-50)",
    bottleneckLimit: toolQty,
    partsDetail: [
      buildPartInfo("HTB-50 小工具/紅", 1, getCategoryStats("手能生巧"), toolQty, true)
    ]
  };

  // 2. 繪聲繪影系列
  const frameQty = getCategoryTotalQty("繪聲繪影A");
  const paintQty = getCategoryTotalQty("繪聲繪影B");
  const sharedLimit = Math.min(frameQty, paintQty);

  // 2.1 胖胖盒款
  const fatBoxQty = getCategoryTotalQty("繪聲繪影C_胖胖盒");
  const fatBoxMax = Math.min(fatBoxQty, sharedLimit);
  let fatBoxBottleneck = "胖胖盒專用箱";
  if (sharedLimit < fatBoxQty) {
    fatBoxBottleneck = frameQty < paintQty ? "著色框圖A7 (共用總量)" : "創意貼顏料四色 (共用總量)";
  }
  results["2"] = {
    productId: "2",
    productName: "繪聲繪影 - 胖胖盒款",
    maxCapacity: fatBoxMax,
    bottleneckCategory: normalizeSharedPoolLabel(fatBoxBottleneck),
    bottleneckLimit: fatBoxMax,
    partsDetail: [
      buildPartInfo("OF-A03L 胖胖盒專用箱", 1, getCategoryStats("繪聲繪影C_胖胖盒"), fatBoxQty, fatBoxQty === fatBoxMax),
      buildPartInfo("著色框圖A7 (共用總量)", 1, getCategoryStats("繪聲繪影A"), frameQty, frameQty === fatBoxMax),
      buildPartInfo("創意貼顏料四色 (共用總量)", 1, getCategoryStats("繪聲繪影B"), paintQty, paintQty === fatBoxMax)
    ]
  };

  // 2.2 TB-200款
  const tb200Qty = getCategoryTotalQty("繪聲繪影C_TB200");
  const tb200Max = Math.min(tb200Qty, sharedLimit);
  let tb200Bottleneck = "TB-200 工具箱專用箱";
  if (sharedLimit < tb200Qty) {
    tb200Bottleneck = frameQty < paintQty ? "著色框圖A7 (共用總量)" : "創意貼顏料四色 (共用總量)";
  }
  results["3"] = {
    productId: "3",
    productName: "繪聲繪影 - TB-200款",
    maxCapacity: tb200Max,
    bottleneckCategory: normalizeSharedPoolLabel(tb200Bottleneck),
    bottleneckLimit: tb200Max,
    partsDetail: [
      buildPartInfo("TB-200 工具箱專用箱", 1, getCategoryStats("繪聲繪影C_TB200"), tb200Qty, tb200Qty === tb200Max),
      buildPartInfo("著色框圖A7 (共用總量)", 1, getCategoryStats("繪聲繪影A"), frameQty, frameQty === tb200Max),
      buildPartInfo("創意貼顏料四色 (共用總量)", 1, getCategoryStats("繪聲繪影B"), paintQty, paintQty === tb200Max)
    ]
  };

  // 2.3 TB-9款
  const tb9Qty = getCategoryTotalQty("繪聲繪影C_TB9");
  const tb9Max = Math.min(tb9Qty, sharedLimit);
  let tb9Bottleneck = "TB-9 隨手工具箱專用箱";
  if (sharedLimit < tb9Qty) {
    tb9Bottleneck = frameQty < paintQty ? "著色框圖A7 (共用總量)" : "創意貼顏料四色 (共用總量)";
  }
  results["4"] = {
    productId: "4",
    productName: "繪聲繪影 - TB-9款",
    maxCapacity: tb9Max,
    bottleneckCategory: normalizeSharedPoolLabel(tb9Bottleneck),
    bottleneckLimit: tb9Max,
    partsDetail: [
      buildPartInfo("TB-9 隨手工具箱專用箱", 1, getCategoryStats("繪聲繪影C_TB9"), tb9Qty, tb9Qty === tb9Max),
      buildPartInfo("著色框圖A7 (共用總量)", 1, getCategoryStats("繪聲繪影A"), frameQty, frameQty === tb9Max),
      buildPartInfo("創意貼顏料四色 (共用總量)", 1, getCategoryStats("繪聲繪影B"), paintQty, paintQty === tb9Max)
    ]
  };

  // 3. 旁敲側擊 (折疊籃)
  const basketParts = [
    { key: "frame", name: "框 (共用總量)", category: "旁敲側擊A", ratio: 1 },
    { key: "bottom", name: "底 (共用總量)", category: "旁敲側擊B", ratio: 1 },
    { key: "longSide", name: "長側板 (共用總量)", category: "旁敲側擊C", ratio: 4 },
    { key: "shortSide", name: "短側板 (共用總量)", category: "旁敲側擊D", ratio: 2 },
    { key: "shortPin", name: "短栓 (鍍五彩)", category: "旁敲側擊E", ratio: 12 },
    { key: "longPin", name: "長栓 (鍍五彩)", category: "旁敲側擊F", ratio: 4 }
  ];

  let basketMinUnits = Infinity;
  let basketBottleneckName = "";
  basketParts.forEach(part => {
    const totalQty = getCategoryTotalQty(part.category);
    const possibleUnits = Math.floor(totalQty / part.ratio);
    if (possibleUnits < basketMinUnits) {
      basketMinUnits = possibleUnits;
      basketBottleneckName = `${part.name} (短板限制)`;
    }
  });

  const basketDetails = basketParts.map(part => {
    const stats = getCategoryStats(part.category);
    const possibleUnits = Math.floor(stats.effectiveTotal / part.ratio);
    const isBtl = (possibleUnits === basketMinUnits);
    return buildPartInfo(part.name, part.ratio, stats, possibleUnits, isBtl);
  });

  results["5"] = {
    productId: "5",
    productName: "旁敲側擊 (折疊籃)",
    maxCapacity: basketMinUnits === Infinity ? 0 : basketMinUnits,
    bottleneckCategory: basketBottleneckName,
    bottleneckLimit: basketMinUnits === Infinity ? 0 : basketMinUnits,
    partsDetail: basketDetails
  };

  // 4. 請多紙膠 (CTB-3215L 潘朵拉盒 + 紙膠帶，由 03_BOM配方設定表 動態驅動)
  let p6Rules = (prodBomMap["6"] && prodBomMap["6"].length > 0) ? [...prodBomMap["6"]] : [];

  // 若 BOM 設定表尚未包含紙膠帶，但庫存中有請多紙膠B或紙膠帶品料，自動防呆補入
  const hasTapeRule = p6Rules.some(r => r.category === "請多紙膠B" || String(r.note || "").includes("紙膠") || String(r.category || "").includes("紙膠") || String(r.category || "").startsWith("5D3"));
  if (!hasTapeRule) {
    const tapeStats = getCategoryStats("請多紙膠B");
    if (tapeStats.effectiveTotal > 0 || tapeStats.erpTotal > 0 || (catMap["請多紙膠B"] && catMap["請多紙膠B"].length > 0)) {
      p6Rules.push({
        productId: "6",
        productName: "請多紙膠",
        category: "請多紙膠B",
        qty: 1,
        note: "DIY 紙膠帶 (共用總量)"
      });
    } else {
      const tapeItem = stockList.find(s => String(s.itemName || "").includes("紙膠帶") || String(s.itemCode || "").startsWith("5D3"));
      if (tapeItem) {
        p6Rules.push({
          productId: "6",
          productName: "請多紙膠",
          category: tapeItem.itemCode,
          qty: 1,
          note: tapeItem.itemName || "mt 紙膠帶"
        });
      }
    }
  }

  // 若仍完全無規則，預設以請多紙膠A與請多紙膠B為基準
  if (p6Rules.length === 0) {
    p6Rules = [
      { productId: "6", productName: "請多紙膠", category: "請多紙膠A", qty: 1, note: "CTB-3215L 潘朵拉盒 (黑/白2色)" },
      { productId: "6", productName: "請多紙膠", category: "請多紙膠B", qty: 1, note: "DIY 紙膠帶 (共用總量)" }
    ];
  }

  let p6MinUnits = Infinity;
  let p6BtlName = "";
  const p6RawDetails = p6Rules.map(rule => {
    const stats = getCategoryStats(rule.category);
    const catQty = stats.effectiveTotal;
    const ratio = Number(rule.qty) || 1;
    const possible = Math.floor(catQty / ratio);
    if (possible < p6MinUnits) {
      p6MinUnits = possible;
      p6BtlName = `${rule.note || rule.category} (短板限制)`;
    }

    let dispName = rule.note || rule.category;
    if (itemMap[rule.category] && itemMap[rule.category].itemName) {
      dispName = rule.note ? `${rule.note} [${itemMap[rule.category].itemName}]` : itemMap[rule.category].itemName;
    }

    return {
      name: dispName,
      requiredPerUnit: ratio,
      stats: stats,
      poolTotal: catQty,
      possibleUnits: possible,
      category: rule.category
    };
  });

  const p6SafeMin = (p6MinUnits === Infinity) ? 0 : p6MinUnits;
  const p6Parts = p6RawDetails.map(d => {
    const isBtl = (d.possibleUnits === p6SafeMin);
    return buildPartInfo(d.name, d.requiredPerUnit, d.stats, d.possibleUnits, isBtl);
  });

  const p6ProdName = (allProducts.find(p => String(p.id) === "6") || {}).name || "請多紙膠";
  results["6"] = {
    productId: "6",
    productName: p6ProdName,
    maxCapacity: p6SafeMin,
    bottleneckCategory: normalizeSharedPoolLabel(p6BtlName) || "材料充足",
    bottleneckLimit: p6SafeMin,
    partsDetail: p6Parts
  };

  // 5. 動態自訂商品 (由 03_BOM配方設定表 底表擴充新增之商品)
  try {
    // 動態建立內建商品 ID 集合（從 CONFIG.PRODUCTS 讀取，不寫死 ID 範圍）
    const builtinIds = new Set(CONFIG.PRODUCTS.map(p => String(p.id)));

    allProducts.forEach(prod => {
      const pId = String(prod.id);
      // 若為內建商品（1~6 已在上方處理），僅補充動態更名
      if (builtinIds.has(pId)) {
        if (results[pId]) {
          results[pId].productName = prod.name; // 支援動態更名
        }
        return;
      }

      const rules = prodBomMap[pId] || [];
      if (rules.length === 0) {
        results[pId] = {
          productId: pId,
          productName: prod.name,
          maxCapacity: 0,
          bottleneckCategory: "尚未設定材料配方",
          bottleneckLimit: 0,
          partsDetail: []
        };
        return;
      }

      let minUnits = Infinity;
      let btlName = "";
      const rawDetails = rules.map(rule => {
        const stats = getCategoryStats(rule.category);
        const catQty = stats.effectiveTotal;
        const ratio = Number(rule.qty) || 1;
        const possible = Math.floor(catQty / ratio);
        if (possible < minUnits) {
          minUnits = possible;
          btlName = `${rule.note || rule.category} (短板限制)`;
        }
        return {
          name: rule.note ? `${rule.note} (${rule.category})` : rule.category,
          requiredPerUnit: ratio,
          stats: stats,
          poolTotal: catQty,
          possibleUnits: possible,
          category: rule.category
        };
      });

      const safeMin = minUnits === Infinity ? 0 : minUnits;
      const partsWithStatus = rawDetails.map(d => {
        const isBtl = (d.possibleUnits === safeMin);
        return buildPartInfo(d.name, d.requiredPerUnit, d.stats, d.possibleUnits, isBtl);
      });

      results[pId] = {
        productId: pId,
        productName: prod.name,
        maxCapacity: safeMin,
        bottleneckCategory: normalizeSharedPoolLabel(btlName) || "材料充足",
        bottleneckLimit: safeMin,
        partsDetail: partsWithStatus
      };
    });
  } catch (dynErr) {
    // 若動態讀取發生異常，保障 1~6 號經典商品正常輸出
  }

  return results;
}

/**
 * 試算表選單觸發：即時試算 6 大體驗商品當前可接單套數與短板分析
 */
function menu_checkBOMCapacities() {
  const ui = SpreadsheetApp.getUi();
  const capacities = calculateProductCapacities();
  
  let msg = "📊 各體驗商品當前可接單上限 (木桶短板試算)：\n";
  msg += "─────────────────────────────\n";
  
  Object.keys(capacities).forEach(id => {
    const p = capacities[id];
    msg += `【${p.productName}】：可做 ${p.maxCapacity} 套\n`;
    msg += `   ↳ 瓶頸短板: ${p.bottleneckCategory} (受限於 ${p.bottleneckLimit} 份)\n`;
  });

  const basket = capacities["5"];
  msg += "\n🧺 折疊籃 6 大部件庫存與套數折算：\n";
  basket.partsDetail.forEach(pt => {
    msg += ` • ${pt.name}：庫存 ${pt.poolTotal} (單份${pt.requiredPerUnit}) ➔ 可做 ${pt.possibleUnits} 套\n`;
  });

  ui.alert("⚡ 即時 BOM 木桶短板運算結果", msg, ui.ButtonSet.OK);
}
