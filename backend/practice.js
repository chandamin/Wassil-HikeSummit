// Constructor
function Person(name,age){
	this.name = name;
	this.age = age;
}
const p1 = new Person("Anurag","23");
const p2 = new Person("abc","24");

console.log("p1 : ",JSON.stringify(p1), "p2: ",JSON.stringify(p2));
