import { program } from "commander";

async function main() {
    program.option('--config');
    program.parse()

    const options = program.opts();
    console.log(options);
    
}