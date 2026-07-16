import fs from 'fs';

const GIST_RAW_URL = 'https://gist.githubusercontent.com/HDR/0659d1717bc61504bf83750628963f4f/raw';
const OUTPUT_FILE = './shared/carLookup.ts';

async function updateCars() {
  console.log(`Baixando lista de carros de: ${GIST_RAW_URL}...`);
  
  try {
    const response = await fetch(GIST_RAW_URL);
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    
    const data = await response.json();
    
    let outputTS = `// AUTO-GENERATED — do not edit by hand.\n`;
    outputTS += `// Source: ${GIST_RAW_URL}\n`;
    outputTS += `// Updated via script for FH6\n\n`;
    outputTS += `export interface CarEntry {\n  make: string;\n  model: string;\n  year: number;\n}\n\n`;
    outputTS += `export const CAR_LOOKUP: Record<number, CarEntry> = {\n`;

    let count = 0;

    // Caso 1: Se for uma Lista de Objetos (Array)
    if (Array.isArray(data)) {
      for (const item of data) {
        const id = item.id ?? item.Ordinal ?? item.ordinal ?? item.Id ?? item.ID;
        const make = item.make ?? item.Make ?? 'Unknown';
        const model = item.model ?? item.Model ?? 'Unknown';
        const year = item.year ?? item.Year ?? 0;
        
        if (id !== undefined && /^\d+$/.test(String(id))) {
          const safeMake = String(make).replace(/'/g, "\\'");
          const safeModel = String(model).replace(/'/g, "\\'");
          outputTS += `  ${id}: { make: '${safeMake}', model: '${safeModel}', year: ${year} },\n`;
          count++;
        }
      }
    } 
    // Caso 2: Se for um Dicionário (Formato do Gist atual)
    else if (typeof data === 'object' && data !== null) {
      const targetData = (data.Cars && typeof data.Cars === 'object' && !Array.isArray(data.Cars)) ? data.Cars : data;

      for (const [key, val] of Object.entries(targetData)) {
        let carId = null;
        let carName = "";
        let make = "Unknown";
        let model = "Unknown";
        let year = 0;

        // Expressão Regular garante que o ID é puramente número
        if (/^\d+$/.test(String(key).trim())) {
          carId = parseInt(key);
          carName = String(val);
        } else if (/^\d+$/.test(String(val).trim())) {
          carId = parseInt(String(val));
          carName = key;
        }

        if (carId !== null) {
          // Quebra a string "Ano Marca Modelo" nos pedaços corretos
          const match = carName.trim().match(/^(\d{4})\s+([^\s]+)\s+(.*)$/);
          if (match) {
            year = parseInt(match[1]);
            make = match[2];
            model = match[3];
          } else {
            model = carName; 
          }

          const safeMake = String(make).replace(/'/g, "\\'");
          const safeModel = String(model).replace(/'/g, "\\'");
          outputTS += `  ${carId}: { make: '${safeMake}', model: '${safeModel}', year: ${year} },\n`;
          count++;
        }
      }
    }

    outputTS += `};\n`;

    fs.writeFileSync(OUTPUT_FILE, outputTS);
    console.log(`✅ Sucesso! ${count} carros atualizados no arquivo ${OUTPUT_FILE}.`);
    
  } catch (error) {
    console.error('❌ Falha ao atualizar a lista de carros:', error);
  }
}

updateCars();