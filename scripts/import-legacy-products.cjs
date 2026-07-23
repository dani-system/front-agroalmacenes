#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '../../backend');
const mongoose = require(path.join(BACKEND_ROOT, 'node_modules/mongoose'));
require(path.join(BACKEND_ROOT, 'node_modules/dotenv')).config({
  path: path.join(BACKEND_ROOT, '.env'),
});

const DEFAULT_SOURCE = '/mnt/c/Users/RICARDO/Downloads/productos_activos_1889.csv';
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../importacion-productos');
const IMPORT_PREFIX = 'LEGACY-FARMACIA-';
const IMPORT_REFERENCE = 'LEGACY_PRODUCT_IMPORT_2026_07';
const PLACEHOLDER_CATEGORY = 'Pendiente de clasificar';
const APPLY_CONFIRMATION = 'IMPORTAR_1889_PRODUCTOS';

const UNIT_DEFINITIONS = [
  { name: 'Unidad', abbreviation: 'UND', patterns: [] },
  { name: 'Litro', abbreviation: 'L', patterns: [/\b1\s*(?:LT|LITRO)\b/] },
  { name: 'Kilogramo', abbreviation: 'kg', patterns: [/\b1\s*(?:KG|KILO|KILOGRAMO)\b/] },
  { name: 'Saco', abbreviation: 'SAC', patterns: [/\bSACO\b/] },
  { name: 'Bolsa', abbreviation: 'BOL', patterns: [/\bBOLSA\b/] },
  { name: 'Caja', abbreviation: 'CAJA', patterns: [/\bCAJA\b/] },
  { name: 'Frasco', abbreviation: 'FCO', patterns: [/\bFRASCO\b/] },
  { name: 'Sobre', abbreviation: 'SOB', patterns: [/\bSOBRE\b/, /\bSACHET\b/] },
  { name: 'Tubo', abbreviation: 'TUB', patterns: [/\bTUBO\b/] },
  { name: 'Ampolla', abbreviation: 'AMP', patterns: [/\bAMPOLLA\b/] },
  { name: 'Jeringa', abbreviation: 'JER', patterns: [/\bJERINGA\b/] },
  { name: 'Galón', abbreviation: 'GAL', patterns: [/\bGALON\b/, /\bGLN\b/] },
  { name: 'Bidón', abbreviation: 'BID', patterns: [/\bBIDON\b/] },
  { name: 'Balde', abbreviation: 'BLD', patterns: [/\bBALDE\b/] },
  { name: 'Botella', abbreviation: 'BOT', patterns: [/\bBOTELLA\b/] },
  { name: 'Paquete', abbreviation: 'PAQ', patterns: [/\bPAQUETE\b/] },
];

function getArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...valueParts] = arg.slice(2).split('=');
    result[key] = valueParts.length ? valueParts.join('=') : true;
  }
  return result;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((value) => value !== '')) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows.shift().map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '') : header,
  );
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+\u0301(?=\w)/g, "'")
    .replace(/[´‘’]/g, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function folded(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseVariants(value) {
  const raw = cleanText(value);
  if (!raw) return [];
  return raw.split(/\s+\|\s+/).map((part) => {
    const match = part.match(
      /^\s*([^:]+):\s*venta\s*=\s*([^,]+),\s*costo\s*=\s*([^,]+),\s*unidad\s*=\s*(.*?),\s*cantidad\s*=\s*(.+?)\s*$/i,
    );
    if (!match) return { raw: part, parseError: true };
    return {
      code: cleanText(match[1]),
      salePrice: numberValue(match[2]),
      cost: numberValue(match[3]),
      unit: cleanText(match[4]),
      quantity: numberValue(match[5]),
      raw: part,
      parseError: false,
    };
  });
}

function measures(value) {
  const result = new Set();
  const normalized = folded(value).replace(/,/g, '.');
  const regex = /(\d+(?:\.\d+)?)\s*(ML|LT|LITROS?|L|KG|KILOS?|KILOGRAMOS?|GRS?|GRAMOS?|MIL\s+SEMILLAS?)/g;
  let match;
  while ((match = regex.exec(normalized))) {
    let unit = match[2];
    if (/^L(?:T|ITRO|ITROS)?$/.test(unit)) unit = 'L';
    if (/^K(?:G|ILO|ILOS|ILOGRAMO|ILOGRAMOS)$/.test(unit)) unit = 'KG';
    if (/^(?:G|GR|GRS|GRAMO|GRAMOS)$/.test(unit)) unit = 'G';
    result.add(`${Number(match[1])}:${unit.replace(/\s+/g, '')}`);
  }
  return result;
}

function priceProblem(variant) {
  if (!variant || variant.parseError || !Number.isFinite(variant.salePrice) || variant.salePrice <= 0) {
    return 'PRECIO_NO_INTERPRETABLE';
  }
  if (Number.isFinite(variant.cost) && variant.cost > variant.salePrice) {
    return 'VENTA_MENOR_QUE_COSTO';
  }
  if (Number.isFinite(variant.cost) && variant.cost > 0 && variant.salePrice / variant.cost > 50) {
    return 'MARGEN_MAYOR_A_5000%';
  }
  return '';
}

function scoreVariant(name, concentration, variant) {
  if (!variant || variant.parseError) return -100;
  const productText = folded(`${name} ${concentration}`);
  const unitText = folded(variant.unit);
  let score = 0;

  const productMeasures = measures(productText);
  for (const measure of measures(unitText)) {
    if (productMeasures.has(measure)) score += 20;
  }

  const packageWords = [
    'SACO', 'BOLSA', 'CAJA', 'FRASCO', 'SOBRE', 'SACHET', 'TUBO',
    'AMPOLLA', 'JERINGA', 'GALON', 'GLN', 'BIDON', 'BALDE', 'BOTELLA', 'COGIN',
  ];
  for (const word of packageWords) {
    if (productText.includes(word) && unitText.includes(word)) score += 5;
  }

  const ignored = new Set(['PARA', 'CON', 'POR', 'UNA', 'UNO', 'UNID', 'UNIDAD', 'VENTA']);
  for (const token of new Set(unitText.split(/[^A-Z0-9]+/).filter((item) => item.length > 2))) {
    if (!ignored.has(token) && productText.includes(token)) score += 1;
  }

  if (/\bNADA\b/.test(unitText)) score -= 20;
  if (!priceProblem(variant)) score += 4;
  if (Number.isFinite(variant.cost) && variant.cost > 0) score += 2;
  return score;
}

function selectVariant(name, concentration, variants) {
  return [...variants]
    .map((variant, index) => ({
      ...variant,
      sourceIndex: index,
      matchScore: scoreVariant(name, concentration, variant),
    }))
    .sort((left, right) =>
      right.matchScore - left.matchScore
      || Number(right.cost > 0) - Number(left.cost > 0)
      || (right.salePrice ?? -1) - (left.salePrice ?? -1),
    )[0] ?? null;
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function inferUnit(name, selectedVariant) {
  const variantUnit = folded(selectedVariant?.unit);
  const productName = folded(name);
  const packageDefinitions = UNIT_DEFINITIONS.slice(3);

  const fromVariant = packageDefinitions.find((definition) =>
    matchesAny(variantUnit, definition.patterns),
  );
  if (fromVariant) return fromVariant.name;

  const fromNamePackage = packageDefinitions.find((definition) =>
    matchesAny(productName, definition.patterns),
  );
  if (fromNamePackage) return fromNamePackage.name;

  const measurementDefinition = UNIT_DEFINITIONS.slice(1, 3).find((definition) =>
    matchesAny(`${variantUnit} ${productName}`, definition.patterns),
  );
  return measurementDefinition?.name ?? 'Unidad';
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, columns, items) {
  const lines = [
    columns.map((column) => csvCell(column.label)).join(','),
    ...items.map((item) =>
      columns.map((column) => csvCell(item[column.key])).join(','),
    ),
  ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function prepareProducts(rows, sourceHash) {
  const requiredHeaders = [
    'idproducto', 'nombre', 'stockactual', 'stockminimo', 'categoria',
    'presentacion', 'laboratorio', 'variantes_precio', 'retirado',
  ];
  const headers = new Set(Object.keys(rows[0] ?? {}));
  const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));
  if (missingHeaders.length) {
    throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(', ')}`);
  }

  const nameCounts = new Map();
  const sourceIdCounts = new Map();
  for (const row of rows) {
    const nameKey = folded(row.nombre);
    const sourceId = cleanText(row.idproducto);
    nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1);
    sourceIdCounts.set(sourceId, (sourceIdCounts.get(sourceId) ?? 0) + 1);
  }

  const products = rows.map((row, rowIndex) => {
    const sourceId = cleanText(row.idproducto);
    const name = cleanText(row.nombre);
    const concentration = cleanText(row.concentracion);
    const variants = parseVariants(row.variantes_precio);
    const selectedVariant = selectVariant(name, concentration, variants);
    const problem = priceProblem(selectedVariant);
    const quantityRaw = numberValue(row.stockactual);
    const minimumRaw = numberValue(row.stockminimo);
    const flags = [];

    if (!sourceId) flags.push('SIN_ID_ORIGEN');
    if (!name) flags.push('SIN_NOMBRE');
    if ((sourceIdCounts.get(sourceId) ?? 0) > 1) flags.push('ID_ORIGEN_DUPLICADO');
    if ((nameCounts.get(folded(name)) ?? 0) > 1) flags.push('NOMBRE_DUPLICADO');
    if (problem) flags.push(problem);
    if (quantityRaw === null || quantityRaw < 0) flags.push('STOCK_CORREGIDO_A_CERO');
    if (variants.some((variant) => variant.parseError)) flags.push('VARIANTE_NO_INTERPRETABLE');
    if (Number(row.cantidad_variantes_precio) !== variants.length) flags.push('CANTIDAD_VARIANTES_NO_COINCIDE');

    return {
      row: rowIndex + 2,
      sourceId,
      externalId: `${IMPORT_PREFIX}${sourceId}`,
      name,
      normalizedName: folded(name),
      targetCategory: PLACEHOLDER_CATEGORY,
      targetCategoryId: '',
      targetUnit: inferUnit(name, selectedVariant),
      quantity: Math.max(0, quantityRaw ?? 0),
      minimum: Math.max(0, minimumRaw ?? 0),
      salePrice: problem ? '' : selectedVariant?.salePrice ?? '',
      sourceSalePrice: selectedVariant?.salePrice ?? '',
      sourceCost: selectedVariant?.cost ?? '',
      selectedVariant: selectedVariant ? selectedVariant.sourceIndex + 1 : '',
      variantCount: variants.length,
      sourceVariantUnit: selectedVariant?.unit ?? '',
      sourceCategory: cleanText(row.categoria),
      sourcePresentation: cleanText(row.presentacion),
      sourceLaboratory: cleanText(row.laboratorio),
      sourceConcentration: concentration,
      sourceDescription: cleanText(row.descripcion),
      retired: folded(row.retirado) === 'SI',
      status: flags.length ? 'REVISAR' : 'LISTO',
      flags: flags.join(' | '),
      canImport: Boolean(sourceId && name && (sourceIdCounts.get(sourceId) ?? 0) === 1),
      sourceHash,
    };
  });

  return {
    products,
    importable: products.filter((product) => product.canImport),
    rejected: products.filter((product) => !product.canImport),
    duplicateNameGroups: [...nameCounts.entries()].filter(([, count]) => count > 1),
    duplicateSourceIds: [...sourceIdCounts.entries()].filter(([, count]) => count > 1),
  };
}

const REVIEW_COLUMNS = [
  { key: 'externalId', label: 'externalId' },
  { key: 'sourceId', label: 'idOrigen' },
  { key: 'name', label: 'nombreLimpio' },
  { key: 'targetCategory', label: 'categoriaTemporal' },
  { key: 'targetUnit', label: 'unidadNormalizada' },
  { key: 'quantity', label: 'stockOrigen' },
  { key: 'minimum', label: 'stockMinimoOrigen' },
  { key: 'salePrice', label: 'precioAImportar' },
  { key: 'sourceSalePrice', label: 'precioVentaOrigen' },
  { key: 'sourceCost', label: 'costoOrigen' },
  { key: 'sourceVariantUnit', label: 'unidadVarianteSeleccionada' },
  { key: 'selectedVariant', label: 'varianteSeleccionada' },
  { key: 'variantCount', label: 'cantidadVariantes' },
  { key: 'sourceCategory', label: 'categoriaFarmaciaOrigen' },
  { key: 'sourcePresentation', label: 'presentacionFarmaciaOrigen' },
  { key: 'sourceLaboratory', label: 'laboratorioOrigen' },
  { key: 'sourceConcentration', label: 'concentracionOrigen' },
  { key: 'status', label: 'estadoRevision' },
  { key: 'flags', label: 'observaciones' },
];

const RECLASSIFICATION_COLUMNS = [
  { key: 'externalId', label: 'externalId' },
  { key: 'name', label: 'nombre' },
  { key: 'targetCategory', label: 'categoriaActual' },
  { key: 'newCategory', label: 'categoriaAgricolaNueva' },
  { key: 'targetUnit', label: 'unidadActual' },
  { key: 'newUnit', label: 'unidadNueva' },
  { key: 'sourceCategory', label: 'categoriaFarmaciaReferencia' },
  { key: 'sourcePresentation', label: 'presentacionFarmaciaReferencia' },
  { key: 'minimum', label: 'stockMinimoPendiente' },
  { key: 'pendingData', label: 'datosPendientes' },
];

function exportPreview(prepared, metadata, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  writeCsv(
    path.join(outputDir, 'productos-limpios-para-importar.csv'),
    REVIEW_COLUMNS,
    prepared.importable,
  );
  writeCsv(
    path.join(outputDir, 'productos-precios-revisar.csv'),
    REVIEW_COLUMNS,
    prepared.importable.filter((product) =>
      product.flags.includes('PRECIO_')
      || product.flags.includes('VENTA_MENOR')
      || product.flags.includes('MARGEN_MAYOR'),
    ),
  );
  writeCsv(
    path.join(outputDir, 'productos-nombres-duplicados.csv'),
    REVIEW_COLUMNS,
    prepared.importable.filter((product) => product.flags.includes('NOMBRE_DUPLICADO')),
  );
  writeCsv(
    path.join(outputDir, 'productos-rechazados.csv'),
    REVIEW_COLUMNS,
    prepared.rejected,
  );
  writeCsv(
    path.join(outputDir, 'productos-pendientes-clasificacion.csv'),
    RECLASSIFICATION_COLUMNS,
    prepared.importable.map((product) => ({
      ...product,
      newCategory: '',
      newUnit: '',
      pendingData: 'Categoría agrícola | Verificar presentación, laboratorio y concentración',
    })),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    ...metadata,
    summary: {
      sourceRows: prepared.products.length,
      importableProducts: prepared.importable.length,
      rejectedProducts: prepared.rejected.length,
      productsWithPrice: prepared.importable.filter((product) => product.salePrice !== '').length,
      productsWithoutTrustedPrice: prepared.importable.filter((product) => product.salePrice === '').length,
      productsWithStock: prepared.importable.filter((product) => product.quantity > 0).length,
      zeroStockProducts: prepared.importable.filter((product) => product.quantity === 0).length,
      duplicateNameGroups: prepared.duplicateNameGroups.length,
      duplicateSourceIds: prepared.duplicateSourceIds.length,
      normalizedUnits: Object.fromEntries(
        [...new Set(prepared.importable.map((product) => product.targetUnit))]
          .sort()
          .map((unit) => [
            unit,
            prepared.importable.filter((product) => product.targetUnit === unit).length,
          ]),
      ),
    },
  };
  fs.writeFileSync(
    path.join(outputDir, 'resumen-importacion.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en backend/.env');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  return mongoose.connection.db;
}

async function getDatabaseContext(db, sourceBranchCode) {
  const [branches, company, priceTier] = await Promise.all([
    db.collection('branches').find({ isActive: true }).sort({ code: 1 }).toArray(),
    db.collection('companies').findOne({ isActive: true }),
    db.collection('price-tiers').findOne({ name: 'Minorista', isActive: true }),
  ]);
  const sourceBranch = branches.find((branch) => branch.code === sourceBranchCode);
  if (!branches.length) throw new Error('No existen sucursales activas');
  if (!sourceBranch) throw new Error(`No existe la sucursal de origen ${sourceBranchCode}`);
  if (!company) throw new Error('No existe una empresa activa');
  if (!priceTier) throw new Error('No existe el nivel de precio Minorista');
  return { branches, sourceBranch, company, priceTier };
}

async function backupCollections(db, outputDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(outputDir, `respaldo-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const collections = ['categories', 'units', 'products', 'stocks', 'stock_movements'];
  const manifest = { createdAt: new Date().toISOString(), database: db.databaseName, collections: {} };

  for (const collectionName of collections) {
    const documents = await db.collection(collectionName).find({}).toArray();
    fs.writeFileSync(
      path.join(backupDir, `${collectionName}.json`),
      `${JSON.stringify(documents, null, 2)}\n`,
    );
    manifest.collections[collectionName] = documents.length;
  }
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { backupDir, manifest };
}

async function ensureCategoryAndUnits(db, products) {
  const now = new Date();
  let category = await db.collection('categories').findOne({ name: PLACEHOLDER_CATEGORY });
  if (!category) {
    const result = await db.collection('categories').insertOne({
      name: PLACEHOLDER_CATEGORY,
      description: 'Productos migrados pendientes de clasificación agrícola.',
      isActive: true,
      parentId: null,
      createdAt: now,
      updatedAt: now,
    });
    category = await db.collection('categories').findOne({ _id: result.insertedId });
  }

  const usedUnits = new Set(products.map((product) => product.targetUnit));
  const definitions = UNIT_DEFINITIONS.filter((definition) => usedUnits.has(definition.name));
  if (definitions.length) {
    await db.collection('units').bulkWrite(
      definitions.map((definition) => ({
        updateOne: {
          filter: { name: definition.name },
          update: {
            $setOnInsert: {
              name: definition.name,
              abbreviation: definition.abbreviation,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  return category;
}

async function migrateStockIndexes(db) {
  const collection = db.collection('stocks');
  const indexes = await collection.indexes();
  const obsoleteIndex = indexes.find((index) =>
    index.unique
    && Object.keys(index.key).length === 2
    && index.key.product === 1
    && index.key.company === 1,
  );
  if (obsoleteIndex) {
    await collection.dropIndex(obsoleteIndex.name);
  }
  await collection.createIndex(
    { product: 1, company: 1, branch: 1 },
    { unique: true, name: 'product_1_company_1_branch_1' },
  );
  return { obsoleteIndexRemoved: obsoleteIndex?.name ?? null };
}

async function applyImport(db, prepared, context, outputDir) {
  const backup = await backupCollections(db, outputDir);
  const indexMigration = await migrateStockIndexes(db);
  const category = await ensureCategoryAndUnits(db, prepared.importable);
  const now = new Date();

  const existingProducts = await db.collection('products')
    .find({ externalId: { $in: prepared.importable.map((product) => product.externalId) } })
    .project({ _id: 1, externalId: 1 })
    .toArray();
  const existingExternalIds = new Set(existingProducts.map((product) => product.externalId));

  const productResult = await db.collection('products').bulkWrite(
    prepared.importable.map((product) => ({
      updateOne: {
        filter: { externalId: product.externalId },
        update: {
          $setOnInsert: {
            externalId: product.externalId,
            name: product.name,
            description: '',
            category: category._id,
            unit: product.targetUnit,
            activeIngredient: '',
            activeIngredients: [],
            prices: product.salePrice === '' ? [] : [{
              priceTier: context.priceTier._id,
              company: context.company._id,
              price: product.salePrice,
            }],
            taxType: 'GRAVADO',
            tracksLot: false,
            isActive: !product.retired,
            minMarginPercent: 5,
            locations: [],
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const importedProducts = await db.collection('products')
    .find({ externalId: { $in: prepared.importable.map((product) => product.externalId) } })
    .project({ _id: 1, externalId: 1 })
    .toArray();
  const productByExternalId = new Map(
    importedProducts.map((product) => [product.externalId, product]),
  );

  const stockOperations = [];
  const stockMetadata = [];
  for (const product of prepared.importable) {
    const databaseProduct = productByExternalId.get(product.externalId);
    if (!databaseProduct) throw new Error(`No se encontró el producto importado ${product.externalId}`);
    for (const branch of context.branches) {
      const quantity = branch._id.equals(context.sourceBranch._id) ? product.quantity : 0;
      stockMetadata.push({ product, databaseProduct, branch, quantity });
      stockOperations.push({
        updateOne: {
          filter: {
            product: databaseProduct._id,
            company: context.company._id,
            branch: branch._id,
          },
          update: {
            $setOnInsert: {
              product: databaseProduct._id,
              company: context.company._id,
              branch: branch._id,
              quantity,
              lastUpdated: now,
              createdAt: now,
              updatedAt: now,
            },
          },
          upsert: true,
        },
      });
    }
  }

  const stockResult = await db.collection('stocks').bulkWrite(stockOperations, { ordered: false });
  const desiredMovements = stockMetadata
    .filter((metadata) =>
      metadata.branch._id.equals(context.sourceBranch._id) && metadata.quantity > 0,
    );
  const existingMovements = await db.collection('stock_movements')
    .find({
      referenceType: IMPORT_REFERENCE,
      product: { $in: desiredMovements.map((metadata) => metadata.databaseProduct._id) },
      company: context.company._id,
      branch: context.sourceBranch._id,
    })
    .project({ product: 1 })
    .toArray();
  const productsWithMovement = new Set(
    existingMovements.map((movement) => String(movement.product)),
  );
  const movements = desiredMovements
    .filter((metadata) => !productsWithMovement.has(String(metadata.databaseProduct._id)))
    .map((metadata) => ({
      product: metadata.databaseProduct._id,
      company: context.company._id,
      branch: metadata.branch._id,
      movementType: 'ADJUSTMENT_IN',
      quantity: metadata.quantity,
      previousStock: 0,
      newStock: metadata.quantity,
      referenceType: IMPORT_REFERENCE,
      description: `Stock inicial migrado desde producto ${metadata.product.sourceId}`,
      date: now,
      createdAt: now,
      updatedAt: now,
    }));
  if (movements.length) {
    await db.collection('stock_movements').insertMany(movements, { ordered: false });
  }

  const result = {
    appliedAt: now.toISOString(),
    backupDir: backup.backupDir,
    sourceBranch: {
      id: String(context.sourceBranch._id),
      code: context.sourceBranch.code,
      name: context.sourceBranch.name,
    },
    activeBranches: context.branches.map((branch) => ({
      id: String(branch._id),
      code: branch.code,
      name: branch.name,
    })),
    placeholderCategory: { id: String(category._id), name: category.name },
    indexMigration,
    productsRequested: prepared.importable.length,
    productsPreviouslyImported: existingExternalIds.size,
    productsInserted: productResult.upsertedCount,
    productDocumentsMatched: productResult.matchedCount,
    stockDocumentsInserted: stockResult.upsertedCount,
    stockDocumentsMatched: stockResult.matchedCount,
    stockMovementsInserted: movements.length,
  };
  fs.writeFileSync(
    path.join(outputDir, 'resultado-importacion.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

async function verifyImport(db, prepared, context) {
  const category = await db.collection('categories').findOne({ name: PLACEHOLDER_CATEGORY });
  const externalIds = prepared.importable.map((product) => product.externalId);
  const importedProducts = await db.collection('products')
    .find({ externalId: { $in: externalIds } })
    .project({ _id: 1, externalId: 1, name: 1, category: 1, unit: 1, prices: 1 })
    .toArray();
  const productIds = importedProducts.map((product) => product._id);
  const stocks = productIds.length
    ? await db.collection('stocks').find({ product: { $in: productIds } }).toArray()
    : [];
  const sourceStocks = stocks.filter((stock) => stock.branch.equals(context.sourceBranch._id));
  const otherStocks = stocks.filter((stock) => !stock.branch.equals(context.sourceBranch._id));
  const duplicateExternalIds = await db.collection('products').aggregate([
    { $match: { externalId: { $in: externalIds } } },
    { $group: { _id: '$externalId', count: { $sum: 1 } } },
    { $match: { count: { $ne: 1 } } },
  ]).toArray();
  const productsStillPending = category
    ? importedProducts.filter((product) => product.category.equals(category._id)).length
    : 0;
  const productsReclassified = importedProducts.length - productsStillPending;
  const sourceQuantityExpected = prepared.importable.reduce(
    (sum, product) => sum + product.quantity,
    0,
  );
  const sourceQuantityActual = sourceStocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const stockIndexes = await db.collection('stocks').indexes();
  const hasBranchUniqueIndex = stockIndexes.some((index) =>
    index.unique
    && Object.keys(index.key).length === 3
    && index.key.product === 1
    && index.key.company === 1
    && index.key.branch === 1,
  );
  const hasObsoleteUniqueIndex = stockIndexes.some((index) =>
    index.unique
    && Object.keys(index.key).length === 2
    && index.key.product === 1
    && index.key.company === 1,
  );
  const [
    totalProducts,
    totalCategories,
    totalUnits,
    totalStocks,
    totalMovements,
    importMovements,
  ] = await Promise.all([
    db.collection('products').countDocuments(),
    db.collection('categories').countDocuments(),
    db.collection('units').countDocuments(),
    db.collection('stocks').countDocuments(),
    db.collection('stock_movements').countDocuments(),
    db.collection('stock_movements').countDocuments({ referenceType: IMPORT_REFERENCE }),
  ]);
  const branchDistribution = context.branches.map((branch) => {
    const branchStocks = stocks.filter((stock) => stock.branch.equals(branch._id));
    return {
      code: branch.code,
      name: branch.name,
      documents: branchStocks.length,
      quantity: branchStocks.reduce((sum, stock) => sum + stock.quantity, 0),
    };
  });

  const checks = {
    allProductsPresent: importedProducts.length === prepared.importable.length,
    noDuplicateExternalIds: duplicateExternalIds.length === 0,
    allBranchStocksPresent:
      stocks.length === prepared.importable.length * context.branches.length,
    sourceStockMatchesCsv: sourceQuantityActual === sourceQuantityExpected,
    noStockDuplicatedToOtherBranches:
      otherStocks.reduce((sum, stock) => sum + stock.quantity, 0) === 0,
    noBlankNames: importedProducts.every((product) => cleanText(product.name)),
    noBlankUnits: importedProducts.every((product) => cleanText(product.unit)),
    correctBranchUniqueIndex: hasBranchUniqueIndex,
    obsoleteUniqueIndexRemoved: !hasObsoleteUniqueIndex,
  };
  return {
    verifiedAt: new Date().toISOString(),
    checks,
    passed: Object.values(checks).every(Boolean),
    counts: {
      expectedProducts: prepared.importable.length,
      importedProducts: importedProducts.length,
      productsStillPending,
      productsReclassified,
      expectedStockDocuments: prepared.importable.length * context.branches.length,
      stockDocuments: stocks.length,
      sourceQuantityExpected,
      sourceQuantityActual,
      otherBranchesQuantity: otherStocks.reduce((sum, stock) => sum + stock.quantity, 0),
      importedProductsWithPrice: importedProducts.filter((product) => product.prices?.length).length,
      importMovements,
    },
    databaseTotals: {
      products: totalProducts,
      categories: totalCategories,
      units: totalUnits,
      stocks: totalStocks,
      stockMovements: totalMovements,
    },
    branchDistribution,
  };
}

async function main() {
  const args = getArgs(process.argv.slice(2));
  const mode = args.mode || 'preview';
  const source = path.resolve(String(args.source || DEFAULT_SOURCE));
  const outputDir = path.resolve(String(args.output || DEFAULT_OUTPUT_DIR));
  const sourceBranchCode = String(args['source-branch'] || '00002');
  if (!fs.existsSync(source)) throw new Error(`No existe el CSV: ${source}`);

  const content = fs.readFileSync(source, 'utf8');
  const sourceHash = crypto.createHash('sha256').update(content).digest('hex');
  const rows = parseCsv(content);
  const prepared = prepareProducts(rows, sourceHash);
  const metadata = {
    source,
    sourceSha256: sourceHash,
    sourceBranchCode,
    placeholderCategory: PLACEHOLDER_CATEGORY,
  };
  const preview = exportPreview(prepared, metadata, outputDir);

  if (mode === 'preview') {
    console.log(JSON.stringify({ mode, outputDir, ...preview.summary }, null, 2));
    return;
  }

  const db = await connectDatabase();
  try {
    const context = await getDatabaseContext(db, sourceBranchCode);
    if (mode === 'backup') {
      const backup = await backupCollections(db, outputDir);
      console.log(JSON.stringify({ mode, ...backup }, null, 2));
      return;
    }
    if (mode === 'verify') {
      const verification = await verifyImport(db, prepared, context);
      fs.writeFileSync(
        path.join(outputDir, 'verificacion-importacion.json'),
        `${JSON.stringify(verification, null, 2)}\n`,
      );
      console.log(JSON.stringify({ mode, outputDir, ...verification }, null, 2));
      if (!verification.passed) process.exitCode = 2;
      return;
    }
    if (mode !== 'apply') throw new Error(`Modo no soportado: ${mode}`);
    if (args.confirm !== APPLY_CONFIRMATION) {
      throw new Error(`Para escribir usa --confirm=${APPLY_CONFIRMATION}`);
    }
    const result = await applyImport(db, prepared, context, outputDir);
    const verification = await verifyImport(db, prepared, context);
    fs.writeFileSync(
      path.join(outputDir, 'verificacion-importacion.json'),
      `${JSON.stringify(verification, null, 2)}\n`,
    );
    console.log(JSON.stringify({ mode, outputDir, result, verification }, null, 2));
    if (!verification.passed) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
