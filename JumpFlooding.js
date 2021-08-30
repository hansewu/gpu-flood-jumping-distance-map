/**
 *	This is a WebGL implementation of the Jump Flooding Algorithm by [Rong&Tan (2006)]
 *	{@link http://www.comp.nus.edu.sg/~tants/jfa.html} for Voronoi Diagrams. It is 
 *	inspired by [Ryan Kaplan's blog]{@link http://rykap.com/graphics/skew/2016/02/25/voronoi-diagrams/}
 *	and its purpose is just for skilling...
 *
 *	@author Marc Listemann
 *
*/
var originTexture,	// This is the offscreen fbo texture the points are first rendered to. It's also the input texture for initSeedTexture(). And will be used later in drawVoronoi() as color reference texture.
	readTexture,	// This is the destination texture for initSeedTexture(), the initial texture for JFA and henceforward a ping-pong texture.
	writeTexture;	// This is the first destination texture for JFA and henceforward a ping-pong texture. Serves as input for drawVoronoi() eventual.
	
var FBO;
	
var g_points = [];
var pointsLength = 0;

const RED = [255.0, 0.0, 0.0];
const GREEN = [0.0, 255.0, 0.0];
const BLUE = [0.0, 0.0, 255.0];
const BACKGROUND_COLOR = [0.0, 0.0, 0.0, 1.0];
	
function main(){
	// PREPARING CANVAS AND WEBGL-CONTEXT
	var canvas1 = document.getElementById("glContext");
	var gl_Original = initWebGL(canvas1);
	var gl1 = WebGLDebugUtils.makeDebugContext(gl_Original);
	resize(canvas1);
	gl1.viewport(0, 0, canvas1.width, canvas1.height);
	
	gl1.clearColor(0.0, 0.0, 0.0, 1.0);
	gl1.clear(gl1.COLOR_BUFFER_BIT);
	
	// PREPARING CANVAS2 AND WEBGL-CONTEXT
	var canvas2 = document.getElementById("glContext2");
	var gl_Original2 = initWebGL(canvas2);
	var gl2 = WebGLDebugUtils.makeDebugContext(gl_Original2);
	resize(canvas2);
	gl2.viewport(0, 0, canvas2.width, canvas2.height);
	
	gl2.clearColor(0.0, 0.0, 0.0, 1.0);
	gl2.clear(gl2.COLOR_BUFFER_BIT);
	
	
	// BUFFERS	
	var pointBuffer = gl1.createBuffer();
	var pointFBOBuffer = gl2.createBuffer();
	
	// SHADER INITIALIZATION
	let vShaderQuad = document.getElementById("vShaderQuad").text,
		fShaderInit = document.getElementById("fShaderInit").text,
		fShaderJFA = document.getElementById("fShaderJFA").text,
		fShaderDrawVoronoi = document.getElementById("fShaderDrawVoronoi").text,
		vShaderPoints = document.getElementById("vShaderPoints").text,
		fShaderPoints = document.getElementById("fShaderPoints").text,
		vShaderDebug = document.getElementById("vShaderDebug").text,
		fShaderDebug = document.getElementById("fShaderDebug").text;	
	
	let pointProgram = createProgram(gl1, vShaderPoints, fShaderPoints);
	let pointProgram2 = createProgram(gl2, vShaderPoints, fShaderPoints);
	let initProgram = createProgram(gl2, vShaderQuad, fShaderInit);	
	let jfaProgram = createProgram(gl2, vShaderQuad, fShaderJFA);
	let voronoiProgram = createProgram(gl2, vShaderQuad, fShaderDrawVoronoi);
	let debugProgram = createProgram(gl2, vShaderDebug, fShaderDebug);
	if (!pointProgram || !pointProgram2 || !initProgram || !jfaProgram || !voronoiProgram || !debugProgram) {
		console.log('Failed to intialize shaders.');
		return;
	}
	
	// QUAD BUFFER
	let quadVertices = new Float32Array([
			-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0
		]);
  
	let quadBuffer = gl2.createBuffer();
	if (!quadBuffer) {
		console.log('Failed to create the buffer object');
		return null;
	}
	
	gl2.bindBuffer(gl2.ARRAY_BUFFER, quadBuffer);
	gl2.bufferData(gl2.ARRAY_BUFFER, quadVertices, gl2.STATIC_DRAW);
	gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
	
	// FBO INITIALIZATION
	FBO = initFBO(gl2);
	
	// MOUSE EVENT
	let mousedowned = false;
	canvas1.addEventListener('mousedown', ev => {
		mousedowned = true;
	});
	canvas1.addEventListener('mouseup', ev => {
		mousedowned = false;
	});
	canvas1.addEventListener('mousemove', ev => {
		if(mousedowned == false) return;
		var x = ev.clientX; // x coordinate of a mouse pointer
		var y = ev.clientY; // y coordinate of a mouse pointer
		var rect = ev.target.getBoundingClientRect() ;
		x = ((x - rect.left) - canvas1.width/2)/(canvas1.width/2);
		y = (canvas1.height/2 - (y - rect.top))/(canvas1.height/2);
		
		// TEXTURE INITIALIZATION
		originTexture = initEmptyTexture(gl2, canvas2);
		readTexture = initEmptyTexture(gl2, canvas2);
		writeTexture = initEmptyTexture(gl2, canvas2);
		
		var stepSize = canvas2.width / 2;
		pointsLength += 1;
		
		drawPointsToColorBuffer(gl1, x, y, pointProgram, pointBuffer);
		drawPointsToFBO(gl2, x, y, pointProgram2, pointFBOBuffer);
			debugRender(gl2, canvas2, debugProgram, quadBuffer, originTexture);
		initSeedTexture(gl2, canvas2, initProgram, quadBuffer);
			debugRender(gl2, canvas2, debugProgram, quadBuffer, readTexture);

		while (stepSize >= 1){
			// run jumpFlood round
			jumpFlood(gl2, canvas2, jfaProgram, quadBuffer, stepSize);
			
				debugRender(gl2, canvas2, debugProgram, quadBuffer, writeTexture);
				
			swapTextures();
			
			// update stepSize
			stepSize /= 2;
		}
		swapTextures();
		drawVoronoi(gl2, canvas2, voronoiProgram, quadBuffer);

	});
}
/**
 *	CREATE FRAMEBUFFER OBJECT
 *	
 *	@param {WebGL_Rendering_Context} gl - WebGL context
*/
function initFBO(gl){

	// Create a frame buffer object (FBO)
	let framebuffer = gl.createFramebuffer();
	if (!framebuffer) {
		console.log('Failed to create frame buffer object');
		return null;
	}
	
	checkFBO(gl, framebuffer);
	
	return framebuffer;
}

/**
 *	CHECK IF FBO IS CONFIGURED CORRECTLY
 *
 *	@param {WebGL_Rendering_Context} gl - WebGL context
*/
function checkFBO(gl){
	let e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if (gl.FRAMEBUFFER_COMPLETE !== e) {
		console.log('Frame buffer object is incomplete: ' + e.toString() + ": ");
		switch(e){
			case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
				console.log("INCOMPLETE_ATTACHMENT");
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
				console.log("INCOMPLETE_MISSING_ATTACHMENT");
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
				console.log("INCOMPLETE_DIMENSIONS");
				break;
			case gl.FRAMEBUFFER_UNSUPPORTED:
				console.log("UNSUPPORTED");
				break;
			default:
				console.log("NO MATCHING ERROR");
		}
		gl.deleteFramebuffer(FBO);
		console.log("Deleted FBO");
		return null;
	}
}

/** 
 *	CREATE EMPTY TEXTURE
*/
function initEmptyTexture(gl, canvas){
	let texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	return texture;
}


function swapTextures(){
	// no parameters passed because it must operate on the global textures
	const tmp = readTexture;
	readTexture = writeTexture;
	writeTexture = tmp;
}


/**
 *	THE ACTUAL JUMP FLOOD CALL
 *
 *  @param {number} stepLength - The current step size.
*/
function jumpFlood(gl, canvas, program, buffer, stepLength){
	
	gl.useProgram(program);
	
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	// DETERMINE SHADER VARIABLES
	let a_Position = gl.getAttribLocation(program, "a_Position");
	let u_Sampler = gl.getUniformLocation(program, "u_Sampler");
	let u_stepSize = gl.getUniformLocation(program, "u_stepSize");
	let u_Resolution = gl.getUniformLocation(program, "u_Resolution");
	if (a_Position < 0 || u_Sampler < 0 || u_stepSize < 0 || u_Resolution < 0) {
		console.log('Failed to get the storage location of a_Position. Maybe the function does not know which shader program to use.');
		return false;
	}
	
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	
	gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(a_Position);
	
	// bind the texture to read from (corresponds to sampler2D object)
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, readTexture);
	
	// pass the uniforms to the fragment shader program (must be in use)
	gl.uniform1i(u_Sampler, 0);				// passes the bound read texture from gl.TEXTURE0 unit to the sampler2D uniform
	gl.uniform1i(u_stepSize, stepLength);	// passes the stepLength to its corresponding uniform
	gl.uniform2f(u_Resolution, canvas.width, canvas.height);
	
	// bind the fbo for offscreen rendering and attach the write texture to the fbo
	gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);
	checkFBO(gl);
	
	// render textured quad
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	// UNBINDING, DISABLING
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.disableVertexAttribArray(a_Position);
}

function drawPointsToColorBuffer(gl, x, y, program, buffer){
	
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	gl.useProgram(program); 
	
	// DETERMINE SHADER VARIABLES
	let a_Position = gl.getAttribLocation(program, "a_Position");
	let a_Color = gl.getAttribLocation(program, "a_Color");
	if (a_Position < 0 || a_Color < 0) {
		console.log('Failed to get the storage location of a_Position. Maybe the function does not know which shader program to use.');
		return false;
	}	
	
	// STORE MOUSE COORDINATES TO G_POINTS
	g_points.push(x, y);
	
	// ADD COLORS TO G_POINTS
	g_points.push(RED[0], RED[1], RED[2]);
	/*switch(pointsLength % 3){
		case 1:
			g_points.push(RED[0], RED[1], RED[2]);
			break;
		case 2:
			g_points.push(GREEN[0], GREEN[1], GREEN[2]);
			break;
		case 0:
			g_points.push(BLUE[0], BLUE[1], BLUE[2]);
	}*/
	
	let pointsBufferObject = new Float32Array(g_points);
	let FSIZE = pointsBufferObject.BYTES_PER_ELEMENT;
	
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, pointsBufferObject, gl.STATIC_DRAW);
	
	gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, FSIZE * 5, 0);
	gl.enableVertexAttribArray(a_Position);
	
	gl.vertexAttribPointer(a_Color, 3, gl.FLOAT, false, FSIZE * 5, FSIZE * 2);
	gl.enableVertexAttribArray(a_Color);
	
	// DRAW TO COLOR BUFFER
	gl.drawArrays(gl.POINTS, 0, pointsLength);
	
	// UNBINDING, DISABLING
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.disableVertexAttribArray(a_Position);
	gl.disableVertexAttribArray(a_Color);
}

function drawPointsToFBO(gl, x, y, program, buffer){
	
	gl.useProgram(program); 
	
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	// DETERMINE SHADER VARIABLES
	let a_Position = gl.getAttribLocation(program, "a_Position");
	let a_Color = gl.getAttribLocation(program, "a_Color");
	if (a_Position < 0 || a_Color < 0) {
		console.log('Failed to get the storage location of a_Position. Maybe the function does not know which shader program to use.');
		return false;
	}	
	
	let pointsBufferObject = new Float32Array(g_points);
	let FSIZE = pointsBufferObject.BYTES_PER_ELEMENT;
	
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, pointsBufferObject, gl.STATIC_DRAW);
	
	gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, FSIZE * 5, 0);
	gl.enableVertexAttribArray(a_Position);
	
	gl.vertexAttribPointer(a_Color, 3, gl.FLOAT, false, FSIZE * 5, FSIZE * 2);
	gl.enableVertexAttribArray(a_Color);
	
	// CHANGE THE DRAWING DESTINATION TO FBO
	gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, originTexture, 0);	
	checkFBO(gl);
	
	// DRAW
	gl.drawArrays(gl.POINTS, 0, pointsLength);
	
	// UNBINDING, DISABLING
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.disableVertexAttribArray(a_Position);
	gl.disableVertexAttribArray(a_Color);
}


function initSeedTexture(gl, canvas, program, buffer){
	
	gl.useProgram(program); 
	
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	// DETERMINE SHADER VARIABLES
	let a_Position = gl.getAttribLocation(program, "a_Position");
	let u_Sampler = gl.getUniformLocation(program, "u_Sampler");
	let u_Resolution = gl.getUniformLocation(program, "u_Resolution");
	// let u_BackgroundColor = gl.getUniformLocation(program, "u_BackgroundColor"); 
	if (a_Position < 0 || u_Sampler < 0 || u_Resolution < 0 /*|| u_BackgroundColor < 0*/) {
		console.log('Failed to get the storage location of a_Position. Maybe the function does not know which shader program to use.');
		return false;
	}	
	
	// VERTEX SHADER STUFF
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  
	gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(a_Position);	
	
	// FRAGMENT SHADER STUFF
		// bind the texture to read from (corresponds to sampler2D object)
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, originTexture);
	
		// pass the uniforms to the fragment shader program (must be in use)
	gl.uniform1i(u_Sampler, 0);
	gl.uniform2f(u_Resolution, canvas.width, canvas.height);
	// gl.uniform4f(u_BackgroundColor, BACKGROUND_COLOR[0], BACKGROUND_COLOR[1], BACKGROUND_COLOR[2], BACKGROUND_COLOR[3]); // maybe better use uniform4fv() to pass the whole array
	
	// bind the fbo for offscreen rendering and attach the read texture to the fbo
	gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, readTexture, 0);
	checkFBO(gl);
	
	// render textured quad
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	
	// UNBINDING, DISABLING
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.disableVertexAttribArray(a_Position);
}

function drawVoronoi(gl, canvas, program, buffer){
	
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	gl.useProgram(program);
	
	let a_Position = gl.getAttribLocation(program, "a_Position");
	let u_SeedTexture = gl.getUniformLocation(program, "u_SeedTexture");
	let u_JumpFloodTexture = gl.getUniformLocation(program, "u_JumpFloodTexture");
	let u_Resolution = gl.getUniformLocation(program, "u_Resolution");
	
	// bind the quad buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	
	gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(a_Position);
	
	// bind the two textures
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, originTexture);
	
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, writeTexture);
	
	// pass the uniforms
	gl.uniform1i(u_SeedTexture, 0);
	gl.uniform1i(u_JumpFloodTexture, 1);
	gl.uniform2f(u_Resolution, canvas.width, canvas.height);
	
	// render textured quad
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	
	// UNBINDING, DISABLING
	gl.bindTexture(gl.TEXTURE_2D, null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.disableVertexAttribArray(a_Position);
}

function debugRender(gl, canvas, program, buffer, texture){
	
	gl.clear(gl.COLOR_BUFFER_BIT);
		
	gl.useProgram(program);
	
	let a_Position = gl.getAttribLocation(program, "a_Position");
	let u_Sampler = gl.getUniformLocation(program, "u_Sampler");
	let u_Resolution = gl.getUniformLocation(program, "u_Resolution");
	
	// bind the quad buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	
	gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(a_Position);
	
	// bind the two textures
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	
	// pass the uniforms
	gl.uniform1i(u_Sampler, 0);
	gl.uniform2f(u_Resolution, canvas.width, canvas.height);
	
	// render textured quad
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	
	// UNBINDING, DISABLING
	gl.bindTexture(gl.TEXTURE_2D, null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.disableVertexAttribArray(a_Position);
	
}

function resize(canvas) {
  // Lookup the size the browser is displaying the canvas.
  var displayWidth  = canvas.clientWidth;
  var displayHeight = canvas.clientHeight;
 
  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
	  canvas.height != displayHeight) {
 
	// Make the canvas the same size
	canvas.width  = displayWidth;
	canvas.height = displayHeight;
  }
}