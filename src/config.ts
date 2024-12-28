import fs from 'node:fs/promises'
import { json } from 'node:stream/consumers'
import { parse } from 'yaml'


async function parseYAMLConfig(filePath: string) {
    const configFileContent = await fs.readFile(filePath, 'utf-8')
    const parseConfiguration = parse(configFileContent)
    return JSON.stringify(parseConfiguration)
}

async function validateConfig(config: string) {
    
}

