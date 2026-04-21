// El evento load dispara el evento al final del proceso de carga del documento. 
// En este punto, todos los objetos del documento son DOM,  y todas las imágenes y sub-frames han terminado de cargarse.
// Existen también los  Eventos DOM Específicos como DOMContentLoaded y DOMFrameContentLoaded (los cuales pueden ser manejados usando element.addEventListener()) y son ejecutados despues de que el DOM de la página ha sido construido, pero no esperear a que otros recursos terminen de cargar.
window.onload = function main() {
// 
  var geolocation = null;
  // check for available geolocation object
  if (window.navigator && window.navigator.geolocation) {
    geolocation = window.navigator.geolocation;
  }
  if (geolocation) {
    // El método getCurrentPosition() inicia una solicitud asíncrona para detectar la posición del usuario, y consulta el hardware de posicionamiento para obtener información actualizada
    //geolocation.getCurrentPosition(onLocationUpdate);
    // El método Geolocation.watchPosition() se utiliza para registrar una función de controlador que se llamará automáticamente cada vez que la posición del dispositivo cambia.
    geolocation.watchPosition(onLocationUpdate);
  } else {
    alert("Error with geolocation!");
  }

  // How figure out device oriented relative to magnetic north
  // Window: deviceorientation event
  // https://developer.mozilla.org/en-US/docs/Web/Events/Orientation_and_motion_data_explained
  window.addEventListener("deviceorientation", onOrientationChange);
};
function onOrientationChange(event) {
// alpha: rotation around z-axis
console.log('Angles:')
var rotateDegrees = event.alpha;
console.log(rotateDegrees);
// gamma: left to right
var leftToRight = event.gamma;
console.log(leftToRight);
// beta: front back motion
var frontToBack = event.beta;
console.log(frontToBack);
// Rotation around the x axis, tipping the device away from or toward the user -- the beta rotation angle
  var beta = event.beta;
// Rotation around the y axis, tilting the device toward the left or right -- the gamma rotation angle
  var gamma = event.gamma;
  const canvas = document.getElementById("canvas");
  // Define full screen canvas
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // <canvas> tiene el method getContext(), usado para obtener el contexto a renderizar y sus funciones de dibujo. getContext() toma un parametro, el tipo de contexto. Para graficos 2D, su especificacion es "2d".
  const context = canvas.getContext("2d");
  // beginPath() method begins a path, or resets the current path
  context.beginPath();
  // Define middle on the screen
  const center = [canvas.width / 2, canvas.height / 2];
  // Redefine position in a screen, up and down center because beta is added to y axis y 
  const location = [center[0], center[1] + ((beta / 180) * canvas.height) / 2];
  // beta /180 -> Will give us range of values from 0 to 1 * height canvas/2 that is the maxim top of screen for go up
  // circle scale with the size of the screen. To do that we change the radius fix value depending on the width of the canvas. For responsing reason.
  const radius = canvas.width * 0.1;
  // Draw a circle with parameters: position x,y; radius ; start angle; end angle
  context.arc(location[0], location[1], radius, 0, Math.PI * 2);
  context.stroke();

  // Propertys to center text on canvas
  context.font = radius + "px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("beta", location[0], location[1]);
}

function onLocationUpdate(event) {
    console.log(event)
  var str =
    "Latitude: " +
    event.coords.latitude +
    "<br>" +
    "Longitude: " +
    event.coords.longitude;
  document.getElementById("coordinates").innerHTML = str;
}

// API IP
// https://ipstack.com/
/*
Standard Lookup: Find below an example for the Standard Lookup Endpoint using jQuery.ajax.

// set endpoint and your access key
var ip = '134.201.250.155'
var access_key = 'YOUR_ACCESS_KEY';

// get the API result via jQuery.ajax
$.ajax({
    url: 'https://api.ipstack.com/' + ip + '?access_key=' + access_key,   
    dataType: 'jsonp',
    success: function(json) {

        // output the "capital" object inside "location"
        alert(json.location.capital);
        
    }
});
*/