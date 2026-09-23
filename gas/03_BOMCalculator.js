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

  // 輔助函式：取得某材料種類的總庫存
  function getCategoryTotalQty(category) {
    const items = catMap[category] || [];
    return items.reduce((sum, it) => sum + (Number(it.effectiveQty) || 0), 0);
  }

  // 輔助函式：取得某材料種類的完整庫存統計 (生效在庫、ERP帳面數、現場盤點數)
  function getCategoryStats(category) {
    const items = catMap[category] || [];
    let effectiveSum = 0;
    let erpSum = 0;
    let cycleCountSum = 0;
    let hasCount = false;

    items.forEach(it => {
      effectiveSum += (Number(it.effectiveQty) || 0);
      erpSum += (Number(it.erpQty) || 0);
      if (it.hasCountToday) {
        hasCount = true;
        cycleCountSum += (Number(it.cycleCountQty !== undefined && it.cycleCountQty !== null ? it.cycleCountQty : it.effectiveQty) || 0);
      }
    });

    return {
      category: category,
      effectiveTotal: effectiveSum,
      erpTotal: erpSum,
      hasCycleCount: hasCount,
      cycleCountTotal: hasCount ? cycleCountSum : null,
      source: hasCount ? "現場實盤優先" : "未更動 (沿用系統)"
    };
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

    return {
      name: name,
      requiredPerUnit: req,
      poolTotal: pool,
      erpQty: erpQty,
      hasCycleCount: hasCount,
      cycleCountQty: cycleCountQty,
      source: source,
      possibleUnits: poss,
      isBottleneck: isBtl,
      suggestedAction: action,
      statusClass: statusClass
    };
  }

  const results = {};

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
    fatBoxBottleneck = frameQty < paintQty ? "著色框圖A7 (共用料)" : "創意貼顏料四色 (共用料)";
  }
  results["2"] = {
    productId: "2",
    productName: "繪聲繪影 - 胖胖盒款",
    maxCapacity: fatBoxMax,
    bottleneckCategory: fatBoxBottleneck,
    bottleneckLimit: fatBoxMax,
    partsDetail: [
      buildPartInfo("OF-A03L 胖胖盒專用箱", 1, getCategoryStats("繪聲繪影C_胖胖盒"), fatBoxQty, fatBoxQty === fatBoxMax),
      buildPartInfo("著色框圖A7 (三款共用)", 1, getCategoryStats("繪聲繪影A"), frameQty, frameQty === fatBoxMax),
      buildPartInfo("創意貼顏料四色 (三款共用)", 1, getCategoryStats("繪聲繪影B"), paintQty, paintQty === fatBoxMax)
    ]
  };

  // 2.2 TB-200款
  const tb200Qty = getCategoryTotalQty("繪聲繪影C_TB200");
  const tb200Max = Math.min(tb200Qty, sharedLimit);
  let tb200Bottleneck = "TB-200 工具箱專用箱";
  if (sharedLimit < tb200Qty) {
    tb200Bottleneck = frameQty < paintQty ? "著色框圖A7 (共用料)" : "創意貼顏料四色 (共用料)";
  }
  results["3"] = {
    productId: "3",
    productName: "繪聲繪影 - TB-200款",
    maxCapacity: tb200Max,
    bottleneckCategory: tb200Bottleneck,
    bottleneckLimit: tb200Max,
    partsDetail: [
      buildPartInfo("TB-200 工具箱專用箱", 1, getCategoryStats("繪聲繪影C_TB200"), tb200Qty, tb200Qty === tb200Max),
      buildPartInfo("著色框圖A7 (三款共用)", 1, getCategoryStats("繪聲繪影A"), frameQty, frameQty === tb200Max),
      buildPartInfo("創意貼顏料四色 (三款共用)", 1, getCategoryStats("繪聲繪影B"), paintQty, paintQty === tb200Max)
    ]
  };

  // 2.3 TB-9款
  const tb9Qty = getCategoryTotalQty("繪聲繪影C_TB9");
  const tb9Max = Math.min(tb9Qty, sharedLimit);
  let tb9Bottleneck = "TB-9 隨手工具箱專用箱";
  if (sharedLimit < tb9Qty) {
    tb9Bottleneck = frameQty < paintQty ? "著色框圖A7 (共用料)" : "創意貼顏料四色 (共用料)";
  }
  results["4"] = {
    productId: "4",
    productName: "繪聲繪影 - TB-9款",
    maxCapacity: tb9Max,
    bottleneckCategory: tb9Bottleneck,
    bottleneckLimit: tb9Max,
    partsDetail: [
      buildPartInfo("TB-9 隨手工具箱專用箱", 1, getCategoryStats("繪聲繪影C_TB9"), tb9Qty, tb9Qty === tb9Max),
      buildPartInfo("著色框圖A7 (三款共用)", 1, getCategoryStats("繪聲繪影A"), frameQty, frameQty === tb9Max),
      buildPartInfo("創意貼顏料四色 (三款共用)", 1, getCategoryStats("繪聲繪影B"), paintQty, paintQty === tb9Max)
    ]
  };

  // 3. 旁敲側擊 (折疊籃)
  const basketParts = [
    { key: "frame", name: "框 (5色總量池)", category: "旁敲側擊A", ratio: 1 },
    { key: "bottom", name: "底 (5色總量池)", category: "旁敲側擊B", ratio: 1 },
    { key: "longSide", name: "長側板 (5色總量池)", category: "旁敲側擊C", ratio: 4 },
    { key: "shortSide", name: "短側板 (4色總量池)", category: "旁敲側擊D", ratio: 2 },
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

  // 4. 請多紙膠
  const pandoraBoxQty = getCategoryTotalQty("請多紙膠A");
  results["6"] = {
    productId: "6",
    productName: "請多紙膠",
    maxCapacity: pandoraBoxQty,
    bottleneckCategory: "CTB-3215L 潘朵拉盒 (紙膠帶待建檔暫以盒為限)",
    bottleneckLimit: pandoraBoxQty,
    partsDetail: [
      buildPartInfo("CTB-3215L 潘朵拉盒 (黑/白2色)", 1, getCategoryStats("請多紙膠A"), pandoraBoxQty, pandoraBoxQty, true)
    ]
  };

  // 5. 動態自訂商品 (由 03_BOM配方設定表 底表擴充新增之商品)
  try {
    const dynConfig = getDynamicProductsAndBOM();
    const allProducts = dynConfig.products || [];
    const allRules = dynConfig.bomRules || [];

    const prodBomMap = {};
    allRules.forEach(r => {
      if (!prodBomMap[r.productId]) prodBomMap[r.productId] = [];
      prodBomMap[r.productId].push(r);
    });

    allProducts.forEach(prod => {
      const pId = String(prod.id);
      // 若為預設 1~6 號已計算，僅在其名稱或配方有微調時補充資訊；若為新自訂商品則執行完整動態短板
      if (["1", "2", "3", "4", "5", "6"].includes(pId)) {
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
        bottleneckCategory: btlName || "材料充足",
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
