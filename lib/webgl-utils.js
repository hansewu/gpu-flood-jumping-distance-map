// WebGL standard operations

function initWebGL(canvas){
	var gl = null;
	var names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
	
	for (var i = 0; i < names.length; ++i){
		try{
			gl = canvas.getContext(names[i], {stencil: true});
		}
		catch(e){}
		if (gl) break;
	}
	
	if (!gl){
		console.log("WebGL context is not available.");
		return;
	}
	
	return gl;
}

function initShaders(gl, vShader, fShader){
	var program = createProgram(gl, vShader, fShader);
	if (!program) {
		console.log('Failed to create program');
		return false;
	}
	
	gl.useProgram(program);
	gl.program = program;
	
	return true;
}

// To create and compile the shaders
function createShader(gl, type, source){
	var shader = gl.createShader(type);
	if (shader == null) {
		console.log('unable to create shader');
		return null;
	}

	// Set the shader program
	gl.shaderSource(shader, source);
	
	// Compile the shader
	gl.compileShader(shader);
	
	// Check the result of compilation
	var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
	if (!compiled) {
		var error = gl.getShaderInfoLog(shader);
		console.log('Failed to compile shader: ' + error);
		gl.deleteShader(shader);
		return null;
	}
	
	return shader;
}

// To link the 2 shaders into a program
function createProgram(gl, vShader, fShader){
	// Create shader objects
	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vShader);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fShader);
	if (!vertexShader || !fragmentShader) {
		return null;
	}
	
	var program = gl.createProgram();
	
	// Attach the shader objects
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);

	// Link the program object
	gl.linkProgram(program);

	// Check the result of linking
	var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
	if (!linked) {
		var error = gl.getProgramInfoLog(program);
		console.log('Failed to link program: ' + error);
		gl.deleteProgram(program);
		gl.deleteShader(fragmentShader);
		gl.deleteShader(vertexShader);
		return null;
	}
	
	return program;
}