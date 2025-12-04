const video = document.getElementById('camera');
const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const captureBtn = document.getElementById('captureBtn');
const loadBtn = document.getElementById('loadBtn');
const saveBtn = document.getElementById('saveBtn');
const trackBtn = document.getElementById('trackBtn');
const guidance = document.getElementById('guidance');
const selectionOverlay = document.getElementById('selection-overlay');
const capturedImage = document.getElementById('captured-image');
const confirmBtn = document.getElementById('confirmBtn');
const fileInput = document.getElementById('fileInput');

let stream = null;
let targetObject = null;
let isTracking = false;
let referenceData = null;
let lastDetectionTime = 0;
const detectionInterval = 1000; // 每 1000ms (1秒) 偵測一次，降低 CPU 負擔
let lastDetectedPosition = null; // 保存上次偵測結果，避免閃爍

// 初始化相機（支援 Webcam 和手機）
async function initCamera() {
  try {
    // 先嘗試後鏡頭，失敗則使用預設相機
    let constraints = {
      video: { 
        facingMode: { exact: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // 如果後鏡頭失敗，使用任意相機（適用於電腦 Webcam）
      console.log('後鏡頭不可用，使用預設相機');
      constraints.video = {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    };
  } catch (error) {
    alert('無法取用相機: ' + error.message);
  }
}

// 載入圖檔按鈕
loadBtn.addEventListener('click', () => {
  fileInput.click();
});

// 處理檔案載入
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // 直接使用整張圖片作為目標物件
        targetObject = {
          x: 0,
          y: 0,
          width: img.width,
          height: img.height
        };
        
        console.log('載入圖檔作為目標:', targetObject);
        referenceData = extractFeatures(targetObject);
        console.log('特徵提取完成:', referenceData);
        
        // 顯示目標物件在右上角
        const targetDisplay = document.getElementById('target-display');
        const targetCanvas = document.getElementById('target-canvas');
        const targetCtx = targetCanvas.getContext('2d');
        
        targetCanvas.width = targetObject.width;
        targetCanvas.height = targetObject.height;
        targetCtx.drawImage(canvas, 0, 0);
        targetDisplay.style.display = 'block';
        
        // 啟用追蹤和保存按鈕
        trackBtn.disabled = false;
        saveBtn.disabled = false;
        
        // 重置檔案輸入，允許重複載入相同檔案
        fileInput.value = '';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
});

// 拍照功能
captureBtn.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  startSelection();
});

// 開始選擇目標物件
function startSelection() {
  // 儲存原始圖片
  const originalImageData = canvas.toDataURL('image/png');
  
  // 建立選擇用的 canvas 和圖片
  let selectionCanvas = document.createElement('canvas');
  let baseImage = new Image();
  
  let selectedRegion = null;
  let startX, startY, endX, endY;
  let isDrawing = false;
  
  baseImage.onload = () => {
    selectionCanvas.width = baseImage.width;
    selectionCanvas.height = baseImage.height;
    capturedImage.src = originalImageData;
    selectionOverlay.style.display = 'flex';
    
    // 設定選擇框繪製
    setupSelection();
  };
  
  baseImage.src = originalImageData;
  
  function setupSelection() {
    const selectionCtx = selectionCanvas.getContext('2d');
    
    // 計算圖片實際顯示的尺寸和偏移
    function getImageCoordinates(e) {
      const rect = capturedImage.getBoundingClientRect();
      const imgNaturalWidth = baseImage.width;
      const imgNaturalHeight = baseImage.height;
      
      // 計算實際顯示的圖片尺寸（保持比例）
      const rectRatio = rect.width / rect.height;
      const imgRatio = imgNaturalWidth / imgNaturalHeight;
      
      let displayWidth, displayHeight, offsetX, offsetY;
      
      if (rectRatio > imgRatio) {
        // 容器較寬，圖片會上下填滿
        displayHeight = rect.height;
        displayWidth = imgNaturalWidth * (rect.height / imgNaturalHeight);
        offsetX = (rect.width - displayWidth) / 2;
        offsetY = 0;
      } else {
        // 容器較高，圖片會左右填滿
        displayWidth = rect.width;
        displayHeight = imgNaturalHeight * (rect.width / imgNaturalWidth);
        offsetX = 0;
        offsetY = (rect.height - displayHeight) / 2;
      }
      
      // 滑鼠在容器中的位置
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // 轉換到圖片座標
      const imgX = (mouseX - offsetX) * (imgNaturalWidth / displayWidth);
      const imgY = (mouseY - offsetY) * (imgNaturalHeight / displayHeight);
      
      return { imgX, imgY, displayWidth, displayHeight, offsetX, offsetY };
    }
    
    // 拖曳開始
    capturedImage.onmousedown = (e) => {
      const coords = getImageCoordinates(e);
      startX = coords.imgX;
      startY = coords.imgY;
      isDrawing = true;
      e.preventDefault();
    };
    
    // 拖曳中
    capturedImage.onmousemove = (e) => {
      if (!isDrawing) return;
      
      const coords = getImageCoordinates(e);
      endX = coords.imgX;
      endY = coords.imgY;
      
      // 重新繪製
      selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
      selectionCtx.drawImage(baseImage, 0, 0);
      
      // 繪製選擇框（虛線）
      selectionCtx.strokeStyle = '#0400ffff';
      selectionCtx.lineWidth = 2;
      selectionCtx.setLineDash([5, 5]);
      selectionCtx.strokeRect(Math.min(startX, endX), Math.min(startY, endY), 
                              Math.abs(endX - startX), Math.abs(endY - startY));
      
      capturedImage.src = selectionCanvas.toDataURL('image/png');
    };
    
    // 拖曳結束
    capturedImage.onmouseup = (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      
      const coords = getImageCoordinates(e);
      endX = coords.imgX;
      endY = coords.imgY;
      
      // 計算實際座標（轉換到原始 canvas 尺寸）
      const scaleX = canvas.width / baseImage.width;
      const scaleY = canvas.height / baseImage.height;
      
      const x = Math.min(startX, endX) * scaleX;
      const y = Math.min(startY, endY) * scaleY;
      const width = Math.abs(endX - startX) * scaleX;
      const height = Math.abs(endY - startY) * scaleY;
      
      if (width > 10 && height > 10) {
        selectedRegion = { x, y, width, height };
        targetObject = selectedRegion;
        
        // 繪製最終選擇框（實線）
        selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        selectionCtx.drawImage(baseImage, 0, 0);
        selectionCtx.strokeStyle = '#ff0000ff';
        selectionCtx.lineWidth = 3;
        selectionCtx.setLineDash([]);
        selectionCtx.strokeRect(Math.min(startX, endX), Math.min(startY, endY), 
                                Math.abs(endX - startX), Math.abs(endY - startY));
        capturedImage.src = selectionCanvas.toDataURL('image/png');
        
        console.log('選擇區域:', selectedRegion);
      }
    };
    
    // 支援觸控裝置
    capturedImage.ontouchstart = (e) => {
      e.preventDefault();
      const coords = getImageCoordinates({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      startX = coords.imgX;
      startY = coords.imgY;
      isDrawing = true;
    };
    
    capturedImage.ontouchmove = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      
      const coords = getImageCoordinates({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      endX = coords.imgX;
      endY = coords.imgY;
      
      // 重新繪製
      selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
      selectionCtx.drawImage(baseImage, 0, 0);
      
      // 計算顯示座標
      const displayWidth = endX - startX;
      const displayHeight = endY - startY;
      
      // 繪製選擇框（虛線）
      selectionCtx.strokeStyle = '#0400ffff';
      selectionCtx.lineWidth = 2;
      selectionCtx.setLineDash([5, 5]);
      selectionCtx.strokeRect(startX, startY, displayWidth, displayHeight);
      
      capturedImage.src = selectionCanvas.toDataURL('image/png');
    };
    
    capturedImage.ontouchend = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      isDrawing = false;
      
      // 計算實際座標（轉換到原始 canvas 尺寸）
      const scaleX = canvas.width / baseImage.width;
      const scaleY = canvas.height / baseImage.height;
      
      const x = Math.min(startX, endX) * scaleX;
      const y = Math.min(startY, endY) * scaleY;
      const width = Math.abs(endX - startX) * scaleX;
      const height = Math.abs(endY - startY) * scaleY;
      
      if (width > 10 && height > 10) {
        selectedRegion = { x, y, width, height };
        targetObject = selectedRegion;
        
        // 繪製最終選擇框（實線）
        selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        selectionCtx.drawImage(baseImage, 0, 0);
        selectionCtx.strokeStyle = '#ff0000ff';
        selectionCtx.lineWidth = 3;
        selectionCtx.setLineDash([]);
        selectionCtx.strokeRect(Math.min(startX, endX), Math.min(startY, endY), 
                                Math.abs(endX - startX), Math.abs(endY - startY));
        capturedImage.src = selectionCanvas.toDataURL('image/png');
        
        console.log('選擇區域:', selectedRegion);
      }
    };
  }
  
  confirmBtn.onclick = () => {
    if (targetObject) {
      console.log('確認選擇，開始提取特徵:', targetObject);
      referenceData = extractFeatures(targetObject);
      console.log('特徵提取完成:', referenceData);
      
      // 顯示目標物件在右上角
      const targetDisplay = document.getElementById('target-display');
      const targetCanvas = document.getElementById('target-canvas');
      const targetCtx = targetCanvas.getContext('2d');
      
      targetCanvas.width = targetObject.width;
      targetCanvas.height = targetObject.height;
      targetCtx.drawImage(canvas, targetObject.x, targetObject.y, targetObject.width, targetObject.height,
                          0, 0, targetObject.width, targetObject.height);
      targetDisplay.style.display = 'block';
      
      selectionOverlay.style.display = 'none';
      trackBtn.disabled = false;
      saveBtn.disabled = false;
    } else {
      alert('請先框選一個物件區域');
    }
  };
}

// 保存目標圖檔
saveBtn.addEventListener('click', () => {
  if (!targetObject || !canvas) {
    alert('請先選擇目標物件！');
    return;
  }
  
  // 建立臨時 canvas 來儲存目標區域
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = targetObject.width;
  tempCanvas.height = targetObject.height;
  const tempCtx = tempCanvas.getContext('2d');
  
  // 繪製目標區域
  tempCtx.drawImage(canvas, 
    targetObject.x, targetObject.y, targetObject.width, targetObject.height,
    0, 0, targetObject.width, targetObject.height);
  
  // 下載圖片
  tempCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `target_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

// 提取特徵（簡化版）
function extractFeatures(region) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(region.x, region.y, region.width, region.height);
  
  console.log('提取特徵 - region:', region);
  console.log('提取特徵 - imageData:', imageData);
  
  return {
    region: region,
    centerX: region.x + region.width / 2,
    centerY: region.y + region.height / 2,
    imageData: imageData
  };
}

// 開始追蹤
trackBtn.addEventListener('click', () => {
  console.log('點擊追蹤按鈕, 當前 isTracking:', isTracking);
  console.log('referenceData:', referenceData);
  
  if (!referenceData) {
    alert('請先拍照並選擇目標物件！');
    return;
  }
  
  isTracking = !isTracking;
  trackBtn.textContent = isTracking ? '⏸ 停止追蹤' : '🎯 開始追蹤';
  
  console.log('設定 isTracking 為:', isTracking);
  
  if (isTracking) {
    console.log('開始追蹤...');
    trackObject();
  } else {
    // 清除 overlay
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    guidance.style.display = 'none';
  }
});

// 追蹤物件並提供引導
function trackObject() {
  if (!isTracking) return;
  
  try {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.drawImage(video, 0, 0);
    
    // 計算畫面中心的對焦框
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const focusWidth = referenceData.region.width;
    const focusHeight = referenceData.region.height;
    const focusX = centerX - focusWidth / 2;
    const focusY = centerY - focusHeight / 2;
    
    // 繪製固定的中心對焦框（白色虛線）
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(focusX, focusY, focusWidth, focusHeight);
    
    // 繪製中心十字線
    ctx.beginPath();
    ctx.moveTo(centerX - 20, centerY);
    ctx.lineTo(centerX + 20, centerY);
    ctx.moveTo(centerX, centerY - 20);
    ctx.lineTo(centerX, centerY + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 頻率控制：每 detectionInterval ms 偵測一次
    const currentTime = Date.now();
    if (currentTime - lastDetectionTime >= detectionInterval) {
      lastDetectionTime = currentTime;
      
      // 偵測物件（簡化：只回傳是否匹配）
      lastDetectedPosition = detectObjectInFrame(canvasCtx);
    }
    
    // 根據偵測結果顯示提示
    if (lastDetectedPosition) {
      const confidence = lastDetectedPosition.confidence || 0;
      
      // 根據信心度改變對焦框顏色和粗細
      if (confidence > 80) {
        ctx.strokeStyle = '#00ff00';  // 綠色
        ctx.lineWidth = 4;
        guidance.textContent = `✅ 完美對齊！(信心度: ${Math.round(confidence)}%)`;
        guidance.style.background = 'rgba(0, 200, 0, 0.9)';
      } else if (confidence > 40) {
        ctx.strokeStyle = '#ffff00';  // 黃色
        ctx.lineWidth = 3;
        guidance.textContent = `⚠️ 可能是目標 (信心度: ${Math.round(confidence)}%)`;
        guidance.style.background = 'rgba(200, 200, 0, 0.9)';
      } else {
        ctx.strokeStyle = '#ff9900';  // 橘色
        ctx.lineWidth = 3;
        guidance.textContent = `⚠️ 不太確定 (信心度: ${Math.round(confidence)}%)`;
        guidance.style.background = 'rgba(200, 100, 0, 0.9)';
      }
      
      ctx.strokeRect(focusX, focusY, focusWidth, focusHeight);
      guidance.style.display = 'block';
      
    } else {
      guidance.textContent = '⚠️ 未偵測到目標 - 請移動相機對準目標物體';
      guidance.style.display = 'block';
      guidance.style.background = 'rgba(200, 0, 0, 0.8)';
    }
    
  } catch (error) {
    console.error('追蹤錯誤:', error);
    guidance.textContent = '⚠️ 追蹤錯誤: ' + error.message;
    guidance.style.display = 'block';
    guidance.style.background = 'rgba(200, 0, 0, 0.8)';
  }
  
  requestAnimationFrame(trackObject);
}

// 在當前畫面中偵測物件（只檢查對焦框內的區域，使用HSV色彩空間）
function detectObjectInFrame(ctx) {
  if (!referenceData || !referenceData.imageData) return null;
  
  const template = referenceData.imageData;
  const templateWidth = template.width;
  const templateHeight = template.height;
  
  // 計算畫面中心的對焦框位置
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const focusX = Math.floor(centerX - templateWidth / 2);
  const focusY = Math.floor(centerY - templateHeight / 2);
  
  // 只檢查對焦框內的區域
  const focusRegion = ctx.getImageData(focusX, focusY, templateWidth, templateHeight);
  
  // 提取模板和對焦區域的HSV特徵（忽略明度V）
  const templateHSV = getAverageHS(template);
  const focusHSV = getAverageHS(focusRegion);
  
  // 計算HSV相似度（只比較色相和飽和度）
  const diff = hsvDifference(templateHSV, focusHSV);
  
  // 設定閾值
  const threshold = 0.25; // HSV差異閾值（0-1之間）
  if (diff > threshold) {
    return null; // 不匹配
  }
  
  const confidence = Math.max(0, 100 - diff * 400);
  
  return {
    x: focusX,
    y: focusY,
    width: templateWidth,
    height: templateHeight,
    confidence: confidence
  };
}

// RGB轉HSV
function rgbToHSV(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h = 0;
  let s = max === 0 ? 0 : delta / max;
  let v = max;
  
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }
  
  return { h, s, v };
}

// 計算區域的平均色相(H)和飽和度(S)，忽略明度(V)
function getAverageHS(imageData) {
  const data = imageData.data;
  let hSum = 0, sSum = 0;
  let count = 0;
  const step = 4; // 每 4 個像素採樣一次
  
  // 使用向量和來計算平均色相（避免色相環繞問題）
  let hCos = 0, hSin = 0;
  
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const hsv = rgbToHSV(r, g, b);
    
    // 只考慮有飽和度的像素（避免灰色像素影響色相）
    if (hsv.s > 0.1) {
      const hRad = hsv.h * Math.PI * 2;
      hCos += Math.cos(hRad) * hsv.s;
      hSin += Math.sin(hRad) * hsv.s;
      sSum += hsv.s;
      count++;
    }
  }
  
  if (count === 0) {
    return { h: 0, s: 0 };
  }
  
  // 計算平均色相
  const avgH = (Math.atan2(hSin, hCos) / (Math.PI * 2) + 1) % 1;
  const avgS = sSum / count;
  
  return { h: avgH, s: avgS };
}

// 計算兩個HSV顏色的差異（只比較H和S，忽略V）
function hsvDifference(hsv1, hsv2) {
  // 色相差異（考慮環繞，0和1是相鄰的）
  let hDiff = Math.abs(hsv1.h - hsv2.h);
  if (hDiff > 0.5) {
    hDiff = 1 - hDiff;
  }
  
  // 飽和度差異
  const sDiff = Math.abs(hsv1.s - hsv2.s);
  
  // 綜合差異（色相權重較高）
  return hDiff * 0.7 + sDiff * 0.3;
}

// 初始化
initCamera();
