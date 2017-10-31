"use strict";

let canvas;
let ctx;
let walkImage;
//our websocket connection
let socket; //this user's socket
let hash; //this user's personal object id

let collisionTestBool;

//directional constants for which directions a user sprite could be facing.
const directions = {
  DOWNLEFT: 0,
  DOWN: 1,
  DOWNRIGHT: 2, 
  LEFT: 3,
  UPLEFT: 4,
  RIGHT: 5, 
  UPRIGHT: 6,
  UP: 7
};

//object to hold all of our squares
//These will be all of our user's objects
//indexed by that user's unique id (hash from the server)
let squares = {};

// object to hold all of the coins we need to draw to the screen
let coins = [];

// object to hold all of the platforms we need to draw on the screen
let platforms = [];

//function to update a square 
//(single square sent from the server)
const update = (data) => {
  //do we have that user?
  //check if square's has a variable named by
  //the hash of the object sent
  if(!squares[data.hash]) {
	//return since there's nothing else to do now
	squares[data.hash] = data;
	//return since there's nothing else to do now 
	return;
  }
  
  //If we were using io.sockets.in or socket.emit (instead of broadcast)
  //we would want to handle if the server was updating our object.
  //Because of round trip time (RTT), our object should be more
  //up to date than the server, but we might allow the server 
  //to completely override this player's info because the server
  //detected a collision or something. 
  /**
  if(data.hash === hash) {
	//handle force overrride of this user from server
	return;
  } **/
  
  //grab our matching object based on the id of the object received
  const square = squares[data.hash]; 

  //if the square to update has a later update time than
  //the packet we just got (due to lag or something)
  //we don't want to process it. It's old data.
  if(squares[data.hash].lastUpdate >= data.lastUpdate) {
	return;
  }

  //overwrite our lastUpdate with the one from the object
  square.lastUpdate = data.lastUpdate;
  /**
	overwrite our previous and destination positions
	with that from the updated object
	
	NOTICE! - we do not use all of the updated object
	because the object we have will have a different
	local x/y that we need to hang on to for animating
	from the current position. The x/y we got from the
	server is accurate, but if we just hop ours to that
	position it's going to look very jittery.
	Instead we will use a lerping function to update
	our local x/y based on our new previous/destination posiions
  **/
  square.prevX = data.prevX;
  square.prevY = data.prevY;
  square.destX = data.destX;
  square.destY = data.destY;
  /**
	reset our local object's alpha
	remember that the alpha is how far is has animated
	between the previous position and destination position
	An alpha of 0 is at the previous position (A)
	An alpha of 1 is at the destination position (B)
	An alpha of 0.5 is halfway between A and B.
	Currently we are resetting ours, but not quite to 0
	because we want to make sure it at least moves.
	If we go to 0, it might be jumping back from a 
	previous lerp and create a frame of jitter.
  **/
  square.alpha = 0;
  
  /**
	Overwrite this square's direction
	and movement with the ones sent. 
	This will make sure our sprite
	continues to face the correct direction and walk smoothly.
	
	NOTICE - we don't overwrite
	the animation. This is because
	we don't want to exactly sync animation. If we did that, then
	our animation would be delayed
	and ruin the illusion. Worse it
	would get frames from another
	machine and would be jumping
	back and forth between different
	stages of the animation.
  **/
  square.direction = data.direction;
  square.moveLeft = data.moveLeft;
  square.moveRight = data.moveRight;
  square.moveDown = data.moveDown;
  square.moveUp = data.moveUp;
  
  // adding data for isFalling, isJumping, airTime and isOnGround to test for gravity
  square.isFalling = data.isFalling;
  square.isJumping = data.isJumping;
  square.airTime = data.airTime;
  square.isOnGround = data.isOnGround;
};

// function when colliding with another user
const collision = (data) => {
  if(hash === data){ //somehow collided with self? do nothing
    return;
  }
  
  collisionTestBool = true;
};

// function to see if someone else has collided with you, and take actions if true
const potentialCollision = (data) => {
  if(hash === data.hashToCheck) { // collision was with this user
   collisionTestBool = true;
  } else {
    collisionTestBool = false;
  }
};

// function to update gravity on the user
const updateGravity = (data) => {
  
  // check to see if time is appropriate / not too old
  if(squares[data.hash].lastUpdate >= data.lastUpdate) {
	return;
  }
  
  const square = squares[data.hash];
  
  // update info given by gravity calculation
  square.moveDown = data.moveDown;
  square.moveUp = data.moveUp;
  square.isFalling = data.isFalling;
  square.isJumping = data.isJumping;
  square.airTime = data.airTime;
  square.isOnGround = data.isOnGround;
  square.destY = data.destY;
  
  square.alpha = 0;
};

//remove a user object by the object's id
//id is the hash from the server of an object
const removeUser = (hash) => {
  //if we have that object
  if(squares[hash]) {
	//delete it from our squares object
	delete squares[hash];
  }
};

//set this user's object from the server
//data will be this user's object
const setUser = (data) => {
  //set this user's hash (this user's id)
  //since they will need it to identify
  //themselves
  hash = data.hash;
  //add this user's object to our square's object 
  //by this user's id.
  //alternatively we could store this user's object
  //separately and draw it. There may be use cases 
  //to do that, but for now all of our objects are
  //drawn and used identically.
  squares[hash] = data;
  //redraw with our latest info
  requestAnimationFrame(redraw);
};

/**
  linear interpolation (lerp) function
  This will calculate how far a number should be
  based on position 1 (v0), position 2 (v1) and
  how far between in % it is (alpha).
  
  An alpha of 0 is at the previous position (A)
  An alpha of 1 is at the destination position (B)
  An alpha of 0.5 is halfway between A and B.
**/
const lerp = (v0, v1, alpha) => {
  //There are many different lerping algorithms
  //not just this one. They all have slightly
  //different results, but are mostly similar.
  return (1 - alpha) * v0 + alpha * v1;
};

//update this user's position
const updatePosition = () => {
  //grab our user's square based on our user's id (hash)
  const square = squares[hash];

  //set our user's previous positions to their last positions
  square.prevX = square.x;
  square.prevY = square.y;
  
  //if the user is going left but not off screen
  //move their destination left (so we can animate)
  //from our current x
  if(square.moveLeft && square.destX > 0) {
	square.destX -= 2;
  }
  
  //if the user is moving right but not off screen
  //move their destination right (so we can animate)
  //from our current x
  if(square.moveRight && square.destX < 400) {
	square.destX += 2;
  }

  //if user is just moving left
  if(square.moveLeft && !(square.moveUp || square.moveDown)) square.direction = directions.LEFT;

  //if user is just moving right
  if(square.moveRight && !(square.moveUp || square.moveDown)) square.direction = directions.RIGHT;
  
  //reset our alpha since we are moving
  //want to reset the animation to keep playing
  square.alpha = 0;

  socket.emit('movementUpdate', square);
};

//redraw our player objects (requestAnimationFrame)
const redraw = (time) => {
  //update our current user's position
  updatePosition();

  //clear screen
  ctx.clearRect(0, 0, 500, 500);

   //grab all the variable names from our squares
  //these will actually be the user id's (hashes)
  //since that's how we index
  const keys = Object.keys(squares);

  ctx.save();
  
  //for each key in squares
  for(let i = 0; i < keys.length; i++) {

	//grab the square by user id (from our keys)
	const square = squares[keys[i]];

	//if alpha less than 1, increase it by 0.05
	//This will keep the animation running smoothly
	//You can modify the speed of this if you want.
	//It will increase or slow the animation time.
	if(square.alpha < 1) square.alpha += 0.05;

	 //if this square is our user's square 
	//by checking our user's id (hash)
	//If so, we'll draw the sprite normally
	if(square.hash === hash) {
	  ctx.filter = "none"
	}
	//otherwise we'll tint the image
	else {
	  ctx.filter = "hue-rotate(40deg)";
	}

	//calculate this square's x and y based on lerping
	//between where their previous and destination positions
	//are along with the alpha value (of how far they are to it).
	square.x = lerp(square.prevX, square.destX, square.alpha);
	square.y = lerp(square.prevY, square.destY, square.alpha);

	// if we are mid animation or moving in any direction
	// we want to make sure we are not stopping an animation that started.
	// we also want to make sure that if we are moving, it starts animating.
	if(square.frame > 0 || (square.moveUp || square.moveDown || square.moveRight || square.moveLeft)) {
	  //start increasing our frame counter
	  //We DON'T want to switch to the next sprite in the spritesheet
	  //every frame. At 60fps that would be flicker. 
	  //Instead when our frame counter reaches 8 (every 8 frames)
	  //we will switch to the next sprite in the spritesheet animation.
	  //The number 8 is arbitrary. It looked decent, but you could increase
	  //the frameCount or lower it.
	  square.frameCount++;

	  //if our framecount reaches our max,
	  //meaning we drew the same sprite that many times,
	  //then it is time to switch to the next sprite in the animation.
	  if(square.frameCount % 8 === 0) {
		//since the images in this spritesheet have 8 frames each
		//starting at 0, we want to make sure the animation loops
		//back around.
		
		//if we have a next image in our spritesheet animation
		//then increase until we hit the limit
		//If we do reach the limit, then loop back around to the
		//beginning of the spritesheet animation to play again.
		if(square.frame < 7) {
		  square.frame++;
		} else {
		  square.frame = 0;
		}
	  }
	}

	//draw our sprite (based on our animation)
	//since we are grabbing a certain frame from 
	//the spritesheet, we need to use the long version of drawImage
	//params -
	//  image, sourceImageX, sourceImageY, sourceImageWidthToGrab
	//  sourceImageHeightToGrab, xToDrawOnCanvas, yToDrawOnCanvas,
	//  widthToDrawnOnCanvas, heightToDrawOnCanvas
	ctx.drawImage(
	  walkImage,  //image to draw
	  //our sprite width * frame number
	  //since our spritesheet animations are in 
	  //rows from left to right
	  square.width * square.frame,
	  //our sprite height * walk direction
	  //since our spritesheet directions are in
	  //columns in clockwise order
	  square.height * square.direction,
	  square.width, //width to grab from the sprite sheet
	  square.height,//height to grab from the sprite sheet
	  square.x, //x location to draw on canvas
	  square.y, //y location to draw on canvas
	  square.width, //width to draw on canvas
	  square.height, //height to draw on canvas
	);
	
	//drawing a optional rectangle around our sprite just to show
	//the size of each sprite
	ctx.strokeRect(square.x, square.y, square.width, square.height);
  }
  
  ctx.restore();
  
    // TEST! SEE IF THE COLLISION IS WORKING
    if(collisionTestBool) {
      ctx.fillText(`You are colliding with another player!`, 100, 100, 400);
    }
    
    // TEST! DRAWING PLATFORM
    ctx.save();
    ctx.fillStyle = 'blue';
    
    // TEST! DRAWING COINS
    for(let i = 0; i < platforms.length; i++) {
      ctx.fillRect(platforms[i].x, platforms[i].y, platforms[i].width, platforms[i].height);
    }
    
    ctx.restore();
    
    collisionTestBool = false;
    
    ctx.save();
    ctx.fillStyle = 'red';
  
    // TEST! DRAWING COINS
    for(let i = 0; i < coins.length; i++) {
      ctx.fillRect(coins[i].x, coins[i].y, coins[i].width, coins[i].height);
    }
  
    ctx.restore();

  //redraw (hopefully at 60fps)
  requestAnimationFrame(redraw);
};

//handle key down
const keyDownHandler = (e) => {
	//grab keycode from keyboard event
	var keyPressed = e.which;
	
	//grab this user's object 
	const square = squares[hash];

	/** 
	  We will set booleans, not draw directly. 
	  That way multiple keys can be down and held.
	  This will allow for angled movement 
	  not just up/down/right/left
	**/
  
	// A OR LEFT
	if (keyPressed === 65 || keyPressed === 37) {
			square.moveLeft = true;
		}
		// D OR RIGHT
		else if (keyPressed === 68 || keyPressed === 39) {
				square.moveRight = true;
			}
			// SpaceBar, JUMP
			else if (keyPressed === 32) {
					if(square.isOnGround) {
                      square.isJumping = true;
                      square.isOnGround = false;
                    }
				}
  
	//if one of these keys is down, let's cancel the browsers
	//default action so the page doesn't try to scroll on the user
	if(square.moveUp || square.moveDown || square.moveLeft || square.moveRight) {
	  e.preventDefault();
	}
};

//key up event
const keyUpHandler = (e) => {
	//grab keycode from keyboard event
	var keyPressed = e.which;
  
	//grab this user's object
	const square = squares[hash];
  
	/** 
	  We will set booleans, not draw directly. 
	  That way multiple keys can be released.
	  This will allow for angled movement 
	  not just up/down/right/left
	**/

	// A OR LEFT
	if (keyPressed === 65 || keyPressed === 37) {
			square.moveLeft = false;
		}
		// D OR RIGHT
		else if (keyPressed === 68 || keyPressed === 39) {
				square.moveRight = false;
			}     
};

// function used to send out to the server to check for collisions
const sendCollisionCheck = () => {
  socket.emit('checkCollisions', squares);
};

const init = () => {
	walkImage = document.querySelector('#walk');
	canvas = document.querySelector('#canvas');
	ctx = canvas.getContext('2d');

	//connect to the server
	//only running once so we don't open multiple
	//connections.
	socket = io.connect();
	
	
	socket.on('connect', function () {
      
      // get the coin/platform data from the server
      socket.emit('getCoinData');
      socket.emit('getPlatormData');
      
      // while connected, we are only checking for collisions every 100ms
      setInterval(sendCollisionCheck, 10);
	  
	});  
	
	//when the socket receives a 'joined'
	//event from the server, call setUser
	socket.on('joined', setUser);
  
    // update the coin/platform arrays from the server
    socket.on('coinDataFromServer', (data) => {
      coins = data;
    });
  
    socket.on('platformDataFromServer', (data) => {
      platforms = data;
    });
	
	//when the socket receives an   'updatedMovement'
	//event from the server, call update
	socket.on('updatedMovement', update);
  
    // gravity
    socket.on('updatedGravity', updateGravity);
  
    // gravity on platform
    socket.on('updatedGravityPlatformMiss', (data) => {
      
      if(squares[data.hash].lastUpdate >= data.lastUpdate) {
	     return;
      }
        
      const square = squares[data.hash];
      
      // update info given by gravity calculation
      square.isFalling = data.isFalling;
      square.isOnGround = data.isOnGround;
      
      square.alpha = 0;
      
    });
  
    socket.on('updatedGravityPlatformHit', (data) => {
      
      if(squares[data.hash].lastUpdate >= data.lastUpdate) {
	     return;
      }
        
      const square = squares[data.hash];
      
      // update info given by gravity calculation
      square.isFalling = data.isFalling;
      square.isOnGround = data.isOnGround;
      square.destY = data.destY;
      
      square.alpha = 0;
      
    });
  
    // collision checks
    socket.on('collided', collision);
    socket.on('potentialCollision', potentialCollision);
	
	//when the socket receives a 'left'
	//event from the server, call removeUser
	socket.on('left', removeUser);
  
	//key listeners
	document.body.addEventListener('keydown', keyDownHandler);
	document.body.addEventListener('keyup', keyUpHandler);
};

window.onload = init;