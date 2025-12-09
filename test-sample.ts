// Sample TypeScript file for testing the LSP API

// Define a simple function
function greetUser(name: string): string {
    return `Hello, ${name}!`;
}

// Use the function multiple times
const greeting1 = greetUser("Alice");
const greeting2 = greetUser("Bob");
const greeting3 = greetUser("Charlie");

// Another function that uses greetUser
function welcomeUser(username: string) {
    const message = greetUser(username);
    console.log(message);
}

// Class that uses greetUser
class Greeter {
    greet(name: string) {
        return greetUser(name);
    }
}

// More usage
const greeter = new Greeter();
greeter.greet("David");

export { greetUser, Greeter };

