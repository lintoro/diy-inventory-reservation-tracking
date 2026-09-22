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

  const results = {};

  // 1. 手能生巧 (HTB-50 經典小工具 1:1)
  const toolQty = getCategoryTotalQty("手能生巧");
  results["1"] = {
    productId: "1",
    productName: "手能生巧",
    maxCapacity: toolQty,
    bottleneckCategory: "手能生巧 (HTB-50)",
    bottleneckLimit: toolQty,
    partsDetail: [
      { name: "HTB-50 小工具/紅", requiredPerUnit: 1, poolTotal: toolQty, possibleUnits: toolQty }
    ]
  };

  // 2. 繪聲繪影系列 (共用料：框圖A7、顏料四色)
  const frameQty = getCategoryTotalQty("繪聲繪影A");     // 著色框圖A7
  const paintQty = getCategoryTotalQty("繪聲繪影B");     // 創意貼顏料四色
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
      { name: "OF-A03L 胖胖盒專用箱", requiredPerUnit: 1, poolTotal: fatBoxQty, possibleUnits: fatBoxQty },
      { name: "著色框圖A7 (共用)", requiredPerUnit: 1, poolTotal: frameQty, possibleUnits: frameQty },
      { name: "創意貼顏料四色 (共用)", requiredPerUnit: 1, poolTotal: paintQty, possibleUnits: paintQty }
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
      { name: "TB-200 工具箱專用箱", requiredPerUnit: 1, poolTotal: tb200Qty, possibleUnits: tb200Qty },
      { name: "著色框圖A7 (共用)", requiredPerUnit: 1, poolTotal: frameQty, possibleUnits: frameQty },
      { name: "創意貼顏料四色 (共用)", requiredPerUnit: 1, poolTotal: paintQty, possibleUnits: paintQty }
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
      { name: "TB-9 隨手工具箱專用箱", requiredPerUnit: 1, poolTotal: tb9Qty, possibleUnits: tb9Qty },
      { name: "著色框圖A7 (共用)", requiredPerUnit: 1, poolTotal: frameQty, possibleUnits: frameQty },
      { name: "創意貼顏料四色 (共用)", requiredPerUnit: 1, poolTotal: paintQty, possibleUnits: paintQty }
    ]
  };

  // 3. 旁敲側擊 (折疊籃 FB-4531) - 6 大部件木桶短板運算
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
  const basketDetails = basketParts.map(part => {
    const totalQty = getCategoryTotalQty(part.category);
    const possibleUnits = Math.floor(totalQty / part.ratio);
    if (possibleUnits < basketMinUnits) {
      basketMinUnits = possibleUnits;
      basketBottleneckName = `${part.name} (短板限制)`;
    }
    return {
      partKey: part.key,
      name: part.name,
      requiredPerUnit: part.ratio,
      poolTotal: totalQty,
      possibleUnits: possibleUnits
    };
  });

  results["5"] = {
    productId: "5",
    productName: "旁敲側擊 (折疊籃)",
    maxCapacity: basketMinUnits === Infinity ? 0 : basketMinUnits,
    bottleneckCategory: basketBottleneckName,
    bottleneckLimit: basketMinUnits === Infinity ? 0 : basketMinUnits,
    partsDetail: basketDetails
  };

  // 4. 請多紙膠 (潘朵拉盒 2色池，紙膠帶 B 待建檔)
  const pandoraBoxQty = getCategoryTotalQty("請多紙膠A");
  results["6"] = {
    productId: "6",
    productName: "請多紙膠",
    maxCapacity: pandoraBoxQty,
    bottleneckCategory: "CTB-3215L 潘朵拉盒 (紙膠帶待建檔暫以盒為限)",
    bottleneckLimit: pandoraBoxQty,
    partsDetail: [
      { name: "CTB-3215L 潘朵拉盒 (黑/白2色)", requiredPerUnit: 1, poolTotal: pandoraBoxQty, possibleUnits: pandoraBoxQty }
    ]
  };

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
