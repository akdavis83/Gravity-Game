import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0000ff, 1, 100);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: false });

    // Set the renderer size and pixel ratio
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);

    this.ball = null;
    this.obstacles = [];
    this.isInitialized = false;

    this.tunnelLength = 1000;
    this.tunnelSize = 10;
    this.ballVelocity = new THREE.Vector3(0, 0, 0);
    this.gravity = new THREE.Vector3(0, -0.015, 0);
    this.pullForce = new THREE.Vector3(0, 0, 0);
    this.maxPullForce = 0.005;
    this.damping = 0.98;
    this.verticalDamping = 0.995;
    this.bounceFactor = 0.7;
    this.tunnelBottom = -this.tunnelLength / 2 + 0.5;

    this.gameStartTime = 0;
    this.gameActive = false;
    this.level = 1;

    this.createUI();
    this.init();
    this.setupControls();

    this.bounceCount = 0; // Initialize bounce counter
  }

  createUI() {
    // Create a single UI container
    const uiElement = document.createElement('div');
    uiElement.id = 'gameUI';
    uiElement.style.position = 'absolute';
    uiElement.style.top = '10px';
    uiElement.style.left = '10px';
    uiElement.style.color = 'white';
    uiElement.style.fontSize = '20px';
    uiElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    uiElement.style.padding = '10px';
    uiElement.style.borderRadius = '5px';
    document.body.appendChild(uiElement);

    // Create game over screen
    this.gameOverScreen = document.createElement('div');
    this.gameOverScreen.style.position = 'absolute';
    this.gameOverScreen.style.top = '50%';
    this.gameOverScreen.style.left = '50%';
    this.gameOverScreen.style.transform = 'translate(-50%, -50%)';
    this.gameOverScreen.style.color = 'white';
    this.gameOverScreen.style.fontSize = '30px';
    this.gameOverScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.gameOverScreen.style.padding = '20px';
    this.gameOverScreen.style.borderRadius = '10px';
    this.gameOverScreen.style.textAlign = 'center';
    this.gameOverScreen.style.display = 'none';
    document.body.appendChild(this.gameOverScreen);

    // Create new level button
    this.newLevelButton = document.createElement('button');
    this.newLevelButton.textContent = 'Start Next Level';
    this.newLevelButton.style.marginTop = '20px';
    this.newLevelButton.style.padding = '10px 20px';
    this.newLevelButton.style.fontSize = '20px';
    this.newLevelButton.addEventListener('click', () => this.startNewLevel());
    this.gameOverScreen.appendChild(this.newLevelButton);
  }

  init() {
    // Create square tunnel
    this.createTunnel();

    // Create ball only if it hasn't been created yet
    if (!this.ball) {
      this.createBall();
    }

    // Create light attached to the ball
    this.ballLight = new THREE.PointLight(0xffffff, 10, 100);
    this.ball.add(this.ballLight);

    // Position camera and make it a child of the ball
    this.camera.position.set(0, 7, 0);
    this.camera.rotation.x = -Math.PI / 2;

    // Create obstacles
    this.createObstacles();

    this.isInitialized = true;

    this.updateUI(); // Initialize UI display
  }

  createBall() {
    const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transmission: 1, // This makes the material transmissive
      thickness: 0.5, // Simulates the thickness of the glass
      ior: 1.5
    });
    this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
    this.ball.position.y = this.tunnelLength / 2 - 1;
    this.scene.add(this.ball);
  }

  createTunnel() {
    const tunnelGeometry = new THREE.BoxGeometry(this.tunnelSize, this.tunnelLength, this.tunnelSize);

    // Generate noise texture
    const textureSize = 8; // Reduced from 64 to 16 for more pixelation
    const noiseCanvas = this.generateNoiseTexture(textureSize, textureSize);
    const noiseTexture = new THREE.CanvasTexture(noiseCanvas);
    noiseTexture.minFilter = THREE.NearestFilter;
    noiseTexture.magFilter = THREE.NearestFilter;
    noiseTexture.wrapS = THREE.RepeatWrapping;
    noiseTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.repeat.set(0.5, this.tunnelLength / 10); // Reduced repeats

    const tunnelMaterial = new THREE.MeshStandardMaterial({
      color: 0x4422bb,
      map: noiseTexture,
      roughnessMap: noiseTexture,
      side: THREE.BackSide
    });

    this.tunnel = new THREE.Mesh(tunnelGeometry, tunnelMaterial);
    this.scene.add(this.tunnel);
  }

  createObstacles() {
    // Clear existing obstacles
    this.obstacles.forEach(obstacle => this.scene.remove(obstacle));
    this.obstacles = [];

    // Calculate number of obstacles based on level
    const baseObstacleCount = 50; // Start with 50 obstacles in level 1
    const obstacleIncreasePerLevel = 30; // Add 30 more obstacles each level
    const obstacleCount = baseObstacleCount + (this.level - 1) * obstacleIncreasePerLevel;

    const obstacleMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff0000, 
      side: THREE.DoubleSide,
      shininess: 50
    });

    // Reuse the same geometry for all obstacles
    const baseGeometry = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < obstacleCount; i++) {
      const obstacle = new THREE.Mesh(baseGeometry, obstacleMaterial);

      // Random size with some larger obstacles
      const size = Math.random() < 0.2 ? Math.random() * 3 + 2 : Math.random() * 1.5 + 0.5;
      obstacle.scale.set(size, size, 1);

      // Random position within the tunnel
      obstacle.position.x = (Math.random() - 0.5) * (this.tunnelSize - 2);
      obstacle.position.y = (this.tunnelLength / 2) - (Math.random() * this.tunnelLength);
      obstacle.position.z = (Math.random() - 0.5) * (this.tunnelSize - 2);

      // Rotate to face upwards
      obstacle.rotation.x = -Math.PI / 2;

      this.scene.add(obstacle);
      this.obstacles.push(obstacle);
    }
  }

  setupControls() {
    document.addEventListener('keydown', (event) => this.handleKeyDown(event));
    document.addEventListener('keyup', (event) => this.handleKeyUp(event));

    window.focus();
    
  }

  handleKeyDown(event) {
    switch(event.key) {
      case 'ArrowLeft':
        this.pullForce.x = -this.maxPullForce;
        break;
      case 'ArrowRight':
        this.pullForce.x = this.maxPullForce;
        break;
      case 'ArrowUp':
        this.pullForce.z = -this.maxPullForce;
        break;
      case 'ArrowDown':
        this.pullForce.z = this.maxPullForce;
        break;
    }
  }

  handleKeyUp(event) {
    switch(event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        this.pullForce.x = 0;
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        this.pullForce.z = 0;
        break;
    }
  }

  startNewGame() {
    this.level = 1;
    this.bounceCount = 0; // Reset bounce counter
    this.gameActive = true;
    this.gameStartTime = Date.now();

    // Reset ball position and velocity
    if (this.ball) {
      this.ball.position.set(0, this.tunnelLength / 2 - 1, 0);
      this.ballVelocity.set(0, 0, 0);
    }

    // Create new obstacles for the new level
    this.createObstacles();

    // Update UI
    this.updateUI();

    // Start animation
    this.animate();
  }

  animate() {
    if (!this.gameActive || !this.isInitialized) return;

    requestAnimationFrame(this.animate.bind(this));

    // Update ball physics
    this.updateBallPhysics();

    // Smooth camera follow
    const cameraTargetY = this.ball.position.y + 5;
    this.camera.position.x += (this.ball.position.x - this.camera.position.x) * 0.1; // Adjust 0.1 for more or less delay
    this.camera.position.y = cameraTargetY; // (cameraTargetY - this.camera.position.y) * 0.1; // Adjust 0.1 for more or less delay
    this.camera.position.z += (this.ball.position.z - this.camera.position.z) * 0.1; // Adjust 0.1 for more or less delay

    // Check for collisions
    this.checkCollisions();

    // Check if ball reached the bottom
    if (this.ball.position.y <= this.tunnelBottom) {
      this.ball.position.y = this.tunnelBottom;
      this.ballVelocity.y = 0;
      this.gameOver();
    }

    // Update UI
    this.updateUI();

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  updateBallPhysics() {
    // Apply gravity
    this.ballVelocity.add(this.gravity);

    // Apply pull force (only to lateral movement)
    this.ballVelocity.x += this.pullForce.x;
    this.ballVelocity.z += this.pullForce.z;

    // Apply damping (separately for lateral and vertical movement)
    this.ballVelocity.x *= this.damping;
    this.ballVelocity.z *= this.damping;
    this.ballVelocity.y *= this.verticalDamping;

    // Update ball position
    this.ball.position.add(this.ballVelocity);
  }

  checkCollisions() {
    // Check for wall collisions
    if (Math.abs(this.ball.position.x) > this.tunnelSize / 2 - 0.5) {
      this.ballVelocity.x *= -this.bounceFactor;
      this.ball.position.x = Math.sign(this.ball.position.x) * (this.tunnelSize / 2 - 0.5);
    }
    if (Math.abs(this.ball.position.z) > this.tunnelSize / 2 - 0.5) {
      this.ballVelocity.z *= -this.bounceFactor;
      this.ball.position.z = Math.sign(this.ball.position.z) * (this.tunnelSize / 2 - 0.5);
    }
    if (this.ball.position.y <= this.tunnelBottom) {
      this.ballVelocity.y *= -this.bounceFactor;
      this.ball.position.y = this.tunnelBottom;
    }

    // Check for obstacle collisions
    for (const obstacle of this.obstacles) {
      const distance = this.ball.position.distanceTo(obstacle.position);
      const minDistance = 0.5 + obstacle.scale.x / 2; // Ball radius + half of obstacle size

      if (distance < minDistance) {
        // Simple bounce effect
        this.ball.position.y = Math.max(this.ball.position.y, obstacle.position.y + minDistance);
        this.ballVelocity.y = Math.abs(this.ballVelocity.y) * this.bounceFactor;
        this.bounceCount++; // Increment bounce counter
        this.updateUI(); // Update UI
        break; // Exit loop after first collision
      }
    }
  }

  updateUI() {
    const uiElement = document.getElementById('gameUI');
    if (uiElement) {
      const elapsedTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
      uiElement.innerHTML = `
                        <div>Level: ${this.level}</div>
                        <div>Time: ${elapsedTime}s</div>
                        <div>Bounces: ${this.bounceCount}</div>
                    `;
    }
  }

  gameOver() {
    this.gameActive = false;
    if (this.gameOverScreen) {
      this.gameOverScreen.style.display = 'block';
      this.gameOverScreen.innerHTML = `
                        <div>Level: ${this.level}</div>
                        <div>Time: ${Math.floor((Date.now() - this.gameStartTime) / 1000)}s</div>
                        <div>Bounces: ${this.bounceCount}</div>
                    `;
      this.gameOverScreen.appendChild(this.newLevelButton);
    }
  }

  startNewLevel() {
    this.level++;
    this.bounceCount = 0;
    this.gameActive = true;
    this.gameStartTime = Date.now();

    // Reset ball position and velocity
    this.ball.position.set(0, this.tunnelLength / 2 - 1, 0);
    this.ballVelocity.set(0, 0, 0);

    // Create new obstacles for the new level
    this.createObstacles();

    // Hide game over screen
    if (this.gameOverScreen) {
      this.gameOverScreen.style.display = 'none';
    }

    // Update UI
    this.updateUI();

    // Restart animation
    this.animate();
  }

  generateNoiseTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const value = Math.floor(Math.random() * 64 + 170);
      data[i] = value;     // red
      data[i + 1] = value; // green
      data[i + 2] = value; // blue
      data[i + 3] = 255;   // alpha
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}

const game = new Game();
game.init(); // Initialize the game
game.startNewGame(); // Start the first game