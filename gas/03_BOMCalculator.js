/**
 * BOM 木桶短板與款式花色總量池運算引擎 (03_BOMCalculator.js)
 */

/**
 * 計算全產品之可接單上限與木桶短板分析
 * @param {Array<Object>} [inventoryList] 29項核心庫存 (若無則自動取用 getEffectiveInventory())
 * @returns {Object} 包含各商品可做套數與短板分析
 */
function calculateProductCapacities(inventoryList) {
  if (!inventoryList && typeof _EXEC_CACHE !== "undefined" && _EXEC_CACHE.productCapacities) {
    return _EXEC_CACHE.productCapacities;
  }
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

  // 載入動態商品主檔與 BOM 配方 (統一由 03_BOM配方設定表 驅動，若無則回退至 CONFIG 預設值)
  let allProducts = [];
  let allRules = [];
  const prodBomMap = {};
  try {
    const dynConfig = getDynamicProductsAndBOM();
    allProducts = (dynConfig.products && dynConfig.products.length > 0) ? dynConfig.products : CONFIG.PRODUCTS;
    allRules = (dynConfig.bomRules && dynConfig.bomRules.length > 0) ? dynConfig.bomRules : CONFIG.BOM_RULES;
  } catch (e) {
    allProducts = CONFIG.PRODUCTS;
    allRules = CONFIG.BOM_RULES;
  }

  allRules.forEach(r => {
    const pid = String(r.productId);
    if (!prodBomMap[pid]) prodBomMap[pid] = [];
    prodBomMap[pid].push(r);
  });

  // 確保預設商品若在動態表中缺漏規則，自動回退至 CONFIG.BOM_RULES
  CONFIG.PRODUCTS.forEach(defProd => {
    const pid = String(defProd.id);
    if (!allProducts.some(p => String(p.id) === pid)) {
      allProducts.push(defProd);
    }
    if (!prodBomMap[pid] || prodBomMap[pid].length === 0) {
      prodBomMap[pid] = CONFIG.BOM_RULES.filter(r => String(r.productId) === pid);
    }
  });

  // 針對全產品統一以動態 BOM 規則進行木桶短板運算
  allProducts.forEach(prod => {
    const pId = String(prod.id);
    let rules = prodBomMap[pId] ? [...prodBomMap[pId]] : [];

    // 針對商品 6 (請多紙膠)：若舊工作表規則尚未包含紙膠帶，自動防呆補入
    if (pId === "6") {
      const hasTapeRule = rules.some(r => r.category === "請多紙膠B" || String(r.note || "").includes("紙膠") || String(r.category || "").includes("紙膠"));
      if (!hasTapeRule) {
        const tapeStats = getCategoryStats("請多紙膠B");
        if (tapeStats.effectiveTotal > 0 || tapeStats.erpTotal > 0 || (catMap["請多紙膠B"] && catMap["請多紙膠B"].length > 0)) {
          rules.push({
            productId: "6",
            productName: prod.name || "請多紙膠",
            category: "請多紙膠B",
            qty: 1,
            note: "DIY 紙膠帶 (共用總量)"
          });
        } else {
          const tapeItem = stockList.find(s => String(s.itemName || "").includes("紙膠帶"));
          if (tapeItem) {
            rules.push({
              productId: "6",
              productName: prod.name || "請多紙膠",
              category: tapeItem.itemCode,
              qty: 1,
              note: tapeItem.itemName || "DIY 紙膠帶"
            });
          }
        }
      }
    }

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
      const cleanNote = normalizeSharedPoolLabel(rule.note || rule.category);

      if (possible < minUnits) {
        minUnits = possible;
        btlName = `${cleanNote} (短板限制)`;
      }

      let dispName = cleanNote;
      if (itemMap[rule.category] && itemMap[rule.category].itemName) {
        dispName = rule.note ? `${cleanNote} [${itemMap[rule.category].itemName}]` : itemMap[rule.category].itemName;
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

  if (!inventoryList && typeof _EXEC_CACHE !== "undefined") {
    _EXEC_CACHE.productCapacities = results;
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
