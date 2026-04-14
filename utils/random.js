function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function randChoice(arr) { return arr[randInt(0, arr.length - 1)]; }