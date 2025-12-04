
export function initRecordMode() {
    const video = document.getElementById('record-video');
    const captureBtn = document.getElementById('record-captureBtn');
    const canvas = document.getElementById('record-canvas');

    if (!video || !captureBtn) {
        console.error('Record mode elements not found');
        return;
    }

    initCamera(video);

    captureBtn.addEventListener('click', () => {
        if (!video.srcObject) return;
        
        // Set canvas size to match video resolution
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        startSelection(canvas, video);
        
        // Visual feedback
        captureBtn.textContent = '已拍照!';
        setTimeout(() => {
            captureBtn.textContent = '拍照';
        }, 1000);
        
        console.log('Photo captured to canvas');
    });
}

// 全域變數
let targetObject = null;
let referenceData = null;
let isTracking = false;
let lastDetectionTime = 0;
const detectionInterval = 1000; // 每 1000ms 偵測一次

// AR 相關全域變數
let arSession = null;
let arRefSpace = null;
let arPerfectMatchTriggered = false;

// 開始選擇目標物件
function startSelection(canvas, video) {
  // 儲存原始圖片
  const originalImageData = canvas.toDataURL('image/png');
  
  // 獲取必要的 DOM 元素
  const capturedImage = document.getElementById('captured-image');
  const selectionOverlay = document.getElementById('selection-overlay');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const targetDisplay = document.getElementById('target-display');
  const targetCanvas = document.getElementById('target-canvas');
  
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
  
  // 確認按鈕
  confirmBtn.onclick = () => {
    if (targetObject) {
      console.log('確認選擇，開始提取特徵:', targetObject);
      referenceData = extractFeatures(targetObject, canvas);
      console.log('特徵提取完成:', referenceData);
      
      // 顯示目標物件在右上角
      const targetCtx = targetCanvas.getContext('2d');
      
      targetCanvas.width = targetObject.width;
      targetCanvas.height = targetObject.height;
      targetCtx.drawImage(canvas, targetObject.x, targetObject.y, targetObject.width, targetObject.height,
                          0, 0, targetObject.width, targetObject.height);
      targetDisplay.style.display = 'block';
      
      selectionOverlay.style.display = 'none';
      
      // 隱藏相機和拍照按鈕，開始追蹤
      setTimeout(() => {
        startTrackingMode(canvas, video);
      }, 500);
    } else {
      alert('請先框選一個物件區域');
    }
  };
  
  // 取消按鈕
  cancelBtn.onclick = () => {
    selectionOverlay.style.display = 'none';
  };
}

// 特徵提取：從裁切的目標物件提取特徵
function extractFeatures(region, sourceCanvas) {
  try {
    // 從主 canvas 中提取目標區域的影像資料
    const sourceCtx = sourceCanvas.getContext('2d');
    const imageData = sourceCtx.getImageData(region.x, region.y, region.width, region.height);
    
    return {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      imageData: imageData
    };
  } catch (error) {
    console.error('特徵提取失敗:', error);
    return null;
  }
}

// 啟動 AR 模式
async function startArMode() {
  console.log('啟動 AR 模式...');
  
  if (arPerfectMatchTriggered) {
    console.log('AR 已啟動，忽略重複請求');
    return;
  }
  
  arPerfectMatchTriggered = true;
  
  try {
    // 檢查 WebXR 支援
    if (!navigator.xr) {
      console.error('WebXR 不支援');
      return;
    }
    
    // 檢查 AR 支援
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      console.error('AR 模式不支援');
      return;
    }
    
    console.log('要求 AR 會話...');
    arSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['dom-overlay'],
      domOverlay: { root: document.getElementById('container') },
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
    });
    
    console.log('AR 會話已建立');
    
    // 嘗試不同的參考空間
    try {
      console.log('嘗試 viewer 參考空間...');
      arRefSpace = await arSession.requestReferenceSpace('viewer');
      console.log('使用 viewer 參考空間');
    } catch (e) {
      console.log('viewer 失敗，嘗試 local-floor...');
      try {
        arRefSpace = await arSession.requestReferenceSpace('local-floor');
        console.log('使用 local-floor 參考空間');
      } catch (e2) {
        console.log('local-floor 失敗，嘗試 local...');
        try {
          arRefSpace = await arSession.requestReferenceSpace('local');
          console.log('使用 local 參考空間');
        } catch (e3) {
          console.log('local 失敗，嘗試 unbounded...');
          arRefSpace = await arSession.requestReferenceSpace('unbounded');
          console.log('使用 unbounded 參考空間');
        }
      }
    }
    
    // 設定 AR 會話結束事件
    arSession.addEventListener('end', () => {
      console.log('AR 會話已結束');
      arSession = null;
      arRefSpace = null;
      arPerfectMatchTriggered = false;
    });
    
    console.log('AR 模式啟動成功！');
    
  } catch (err) {
    console.error('AR 啟動失敗:', err.message);
    arPerfectMatchTriggered = false;
  }
}

// 開始追蹤模式
function startTrackingMode(sourceCanvas, video) {
  const recordInterface = document.getElementById('record-interface');
  
  // 隱藏相機介面
  recordInterface.style.display = 'none';
  
  // 建立追蹤 canvas
  const trackingCanvas = document.createElement('canvas');
  trackingCanvas.id = 'tracking-canvas';
  trackingCanvas.style.position = 'fixed';
  trackingCanvas.style.top = '0';
  trackingCanvas.style.left = '0';
  trackingCanvas.style.zIndex = '1400';
  document.body.appendChild(trackingCanvas);
  
  // 建立引導文字
  const guidance = document.createElement('div');
  guidance.id = 'guidance';
  guidance.style.position = 'fixed';
  guidance.style.top = '20px';
  guidance.style.left = '50%';
  guidance.style.transform = 'translateX(-50%)';
  guidance.style.background = 'rgba(0, 0, 0, 0.8)';
  guidance.style.color = 'white';
  guidance.style.padding = '15px 25px';
  guidance.style.borderRadius = '10px';
  guidance.style.zIndex = '1500';
  guidance.style.display = 'block';
  guidance.textContent = '開始追蹤...';
  document.body.appendChild(guidance);
  
  // 建立停止追蹤按鈕
  const stopBtn = document.createElement('button');
  stopBtn.textContent = '⏹ 停止追蹤';
  stopBtn.style.position = 'fixed';
  stopBtn.style.bottom = '30px';
  stopBtn.style.left = '50%';
  stopBtn.style.transform = 'translateX(-50%)';
  stopBtn.style.padding = '15px 30px';
  stopBtn.style.fontSize = '18px';
  stopBtn.style.background = '#f44336';
  stopBtn.style.color = 'white';
  stopBtn.style.border = 'none';
  stopBtn.style.borderRadius = '25px';
  stopBtn.style.cursor = 'pointer';
  stopBtn.style.zIndex = '1600';
  stopBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
  document.body.appendChild(stopBtn);
  
  isTracking = true;
  
  stopBtn.addEventListener('click', () => {
    isTracking = false;
    trackingCanvas.remove();
    guidance.remove();
    stopBtn.remove();
    recordInterface.style.display = 'block';
    console.log('追蹤已停止');
  });
  
  // 開始追蹤迴圈
  trackObjectFrame(trackingCanvas, guidance, sourceCanvas, video);
}

function trackObjectFrame(canvas, guidance, sourceCanvas, video) {
  if (!isTracking) return;
  
  try {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 繪製相機畫面到 tracking canvas
    ctx.drawImage(video, 0, 0);
    
    // 計算畫面中心的對焦框
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const focusWidth = referenceData.width;
    const focusHeight = referenceData.height;
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
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
    
    // 頻率控制：每 detectionInterval ms 偵測一次
    const currentTime = Date.now();
    if (currentTime - lastDetectionTime >= detectionInterval) {
      lastDetectionTime = currentTime;
      
      // 使用HSV色彩空間進行物件偵測
      const detected = detectObjectInFrame(ctx);
      
      if (detected) {
        const confidence = detected.confidence || 0;
        
        if (confidence > 80) {
          ctx.strokeStyle = '#00ff00';  // 綠色
          ctx.lineWidth = 4;
          guidance.textContent = `✅ 完美對齊！(信心度: ${Math.round(confidence)}%) - 啟動 AR...`;
          guidance.style.background = 'rgba(0, 200, 0, 0.9)';
          
          // 啟動 AR 模式
          if (!arPerfectMatchTriggered) {
            startArMode();
          }
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
        
        ctx.setLineDash([]);
        ctx.strokeRect(focusX, focusY, focusWidth, focusHeight);
      } else {
        guidance.textContent = '⚠️ 未偵測到目標 - 請移動相機對準目標物體';
        guidance.style.background = 'rgba(200, 0, 0, 0.8)';
      }
    }
    
  } catch (error) {
    console.error('追蹤錯誤:', error);
    guidance.textContent = '⚠️ 追蹤錯誤: ' + error.message;
    guidance.style.background = 'rgba(200, 0, 0, 0.8)';
  }
  
  requestAnimationFrame(() => trackObjectFrame(canvas, guidance, sourceCanvas, video));
}

// 在當前畫面中偵測物件（只檢查對焦框內的區域，使用HSV色彩空間）
function detectObjectInFrame(ctx) {
  if (!referenceData || !referenceData.imageData) return null;
  
  const template = referenceData.imageData;
  const templateWidth = template.width;
  const templateHeight = template.height;
  
  // 計算畫面中心的對焦框位置
  const centerX = ctx.canvas.width / 2;
  const centerY = ctx.canvas.height / 2;
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

async function initCamera(videoElement) {
    try {
        // Try to use the rear camera first
        let constraints = {
            video: { 
                facingMode: { exact: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.log('Rear camera not available, trying default camera...');
            // Fallback to any available camera
            constraints.video = {
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        videoElement.srcObject = stream;
        console.log('Camera initialized successfully');
        
    } catch (error) {
        console.error('Camera initialization failed:', error);
        alert('無法開啟相機: ' + error.message);
    }
}
