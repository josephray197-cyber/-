// 1. 渲染器
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') });
renderer.setSize(window.innerWidth, window.innerHeight);

// 2. 场景 + 相机
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.position.z = 120;
const N = 8000; // 粒子数量
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(N * 3); // 每个粒子 x y z
const colors    = new Float32Array(N * 3); // 每个粒子 r g b

for (let i = 0; i < N; i++) {
  // 星云模型：随机球形分布
  const r   = 20 + Math.random() * 50;
  const phi = Math.acos(2 * Math.random() - 1);
  const th  = Math.random() * Math.PI * 2;
  positions[i*3]   = r * Math.sin(phi) * Math.cos(th);
  positions[i*3+1] = r * Math.sin(phi) * Math.sin(th);
  positions[i*3+2] = r * Math.cos(phi);

  // 颜色：HSL 渐变
  const c = new THREE.Color().setHSL(i / N, 0.9, 0.65);
  colors[i*3] = c.r;  colors[i*3+1] = c.g;  colors[i*3+2] = c.b;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

// AdditiveBlending = 叠加混合，产生辉光效果
const material = new THREE.PointsMaterial({
  size: 3,
  vertexColors: true,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending, // 关键：辉光靠这一行
  depthWrite: false
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);
const video = document.createElement('video');
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
  video.srcObject = stream;
  video.play();
});

// 初始化 MediaPipe Hands
const hands = new Hands({ locateFile: f =>
  `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });

hands.setOptions({ maxNumHands: 1, modelComplexity: 1,
  minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });

hands.onResults(results => {
  if (!results.multiHandLandmarks?.length) return;
  const lm = results.multiHandLandmarks[0]; // 21个关键点
  processHand(lm); // 下一步处理
});

// 启动摄像头循环
const cam = new Camera(video, {
  onFrame: async () => await hands.send({ image: video }),
  width: 320, height: 240
});
cam.start();
let targetSpread = 1.0;  // 扩散系数
let targetRotY   = 0;    // 旋转目标

function processHand(lm) {
  // 手掌位置 → 旋转
  const wrist = lm[0];
  targetRotY = (wrist.x - 0.5) * Math.PI * 0.8; // 左右映射到旋转

  // 拇指尖(4) 与 食指尖(8) 距离 → 开合度
  const dx = lm[4].x - lm[8].x;
  const dy = lm[4].y - lm[8].y;
  const pinch = Math.sqrt(dx*dx + dy*dy); // 0.02(闭合) ~ 0.25(张开)

  // 线性映射：闭合=收缩，张开=扩散
  targetSpread = 0.3 + ((pinch - 0.02) / 0.23) * 2.5;
}
let spreadFactor = 1.0;
let rotY = 0;

function animate() {
  requestAnimationFrame(animate);

  // 平滑插值：避免突变
  rotY         += (targetRotY   - rotY)         * 0.04;
  spreadFactor += (targetSpread - spreadFactor) * 0.03;

  // 应用旋转
  particles.rotation.y = rotY;

  // 每帧更新粒子位置（扩散/收缩）
  const pos = geometry.attributes.position.array;
  for (let i = 0; i < N; i++) {
    pos[i*3]   = basePositions[i*3]   * spreadFactor;
    pos[i*3+1] = basePositions[i*3+1] * spreadFactor;
    pos[i*3+2] = basePositions[i*3+2] * spreadFactor;
  }
  geometry.attributes.position.needsUpdate = true; // 必须标记更新

  // 色相随旋转角度漂移
  const hueOffset = rotY / (Math.PI * 2);
  const col = geometry.attributes.color.array;
  for (let i = 0; i < N; i += 4) { // 每4个粒子更新一次（优化性能）
    const c = new THREE.Color().setHSL((baseHues[i] + hueOffset) % 1, 0.9, 0.65);
    col[i*3] = c.r;  col[i*3+1] = c.g;  col[i*3+2] = c.b;
  }
  geometry.attributes.color.needsUpdate = true;

  renderer.render(scene, camera);
}
animate();