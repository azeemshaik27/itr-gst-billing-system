/**
 * database.js
 * Persists and manages the state of products, invoices, purchases, and filing records.
 * Automatically seeds realistic transaction histories for Retailers and Manufacturers.
 */

const STORAGE_KEYS = {
  PROFILE: 'tax_system_profile',
  SALES: 'tax_system_sales',
  PURCHASES: 'tax_system_purchases',
  PRODUCTS: 'tax_system_products',
  FILINGS: 'tax_system_filings'
};

const DEFAULT_PRODUCTS = {
  retailer: [
    { id: 'P001', name: 'High-End Gaming Laptop', hsn: '84713010', price: 95000, gstRate: 18, stock: 45 },
    { id: 'P002', name: 'Mechanical Keyboard (RGB)', hsn: '84716060', price: 6500, gstRate: 18, stock: 120 },
    { id: 'P003', name: 'Ergonomic Wireless Mouse', hsn: '84716060', price: 3200, gstRate: 18, stock: 200 },
    { id: 'P004', name: '27" 4K Ultra-Sharp Monitor', hsn: '85285200', price: 28000, gstRate: 18, stock: 30 },
    { id: 'P005', name: 'USB-C Multi-Port Adapter', hsn: '84733099', price: 4500, gstRate: 18, stock: 85 }
  ],
  manufacturer: [
    { id: 'M001', name: 'Precision CNC Machined Parts', hsn: '84669390', price: 12000, gstRate: 18, stock: 1200 },
    { id: 'M002', name: 'Heavy Duty Structural Steel Beam', hsn: '72165000', price: 45000, gstRate: 18, stock: 80 },
    { id: 'M003', name: 'Industrial Automated Controller Unit', hsn: '85371019', price: 185000, gstRate: 18, stock: 15 },
    // Raw materials (normally purchased, but stored here for catalog Reference)
    { id: 'R001', name: 'Raw Aluminum Ingot (Grade A)', hsn: '76011010', price: 210000, gstRate: 18, stock: 50 },
    { id: 'R002', name: 'Alloy Steel Plate (10mm)', hsn: '72254019', price: 85000, gstRate: 18, stock: 110 }
  ]
};

const DEFAULT_CUSTOMERS = [
  { name: 'Quantum Tech Solutions', gstin: '27AAAAA1111A1Z1', state: 'Maharashtra', email: 'billing@quantumtech.com' },
  { name: 'Apex Retail Stores Inc.', gstin: '29BBBBB2222B2Z2', state: 'Karnataka', email: 'accounts@apexretail.in' },
  { name: 'Alpha Manufacturing Ltd', gstin: '07CCCCC3333C3Z3', state: 'Delhi', email: 'supply@alphamanufacturing.com' },
  { name: 'Individual Walk-in Client', gstin: 'URP', state: 'Maharashtra', email: 'client@walkin.com' } // URP = Unregistered Person
];

const DEFAULT_VENDORS = [
  { name: 'Metro Metal Suppliers', gstin: '27VDD1234D1Z4', state: 'Maharashtra', category: 'Raw Materials' },
  { name: 'ElectroChip Semiconductors', gstin: '07VEF5678E2Z5', state: 'Delhi', category: 'Components' },
  { name: 'National Grid Electricity Corp', gstin: 'URP', state: 'Maharashtra', category: 'Utilities' },
  { name: 'Super Logistics India', gstin: '29VGH9012G3Z6', state: 'Karnataka', category: 'Freight & Transport' }
];

class TaxSystemDatabase {
  constructor() {
    this.init();
  }

  init() {
    // Determine user profile (retailer or manufacturer)
    if (!localStorage.getItem(STORAGE_KEYS.PROFILE)) {
      localStorage.setItem(STORAGE_KEYS.PROFILE, 'retailer');
    }
    this.currentProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);

    // Initial check and seeding
    if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS + '_' + this.currentProfile)) {
      this.seedData();
    }
  }

  setProfile(profile) {
    if (profile !== 'retailer' && profile !== 'manufacturer') return;
    localStorage.setItem(STORAGE_KEYS.PROFILE, profile);
    this.currentProfile = profile;
    this.init();
  }

  getProfile() {
    return this.currentProfile;
  }

  seedData() {
    console.log(`Seeding mock data for ${this.currentProfile}...`);
    
    // Seed products
    localStorage.setItem(
      STORAGE_KEYS.PRODUCTS + '_' + this.currentProfile,
      JSON.stringify(DEFAULT_PRODUCTS[this.currentProfile])
    );

    // Seed sales (billing records)
    const sales = this.generateSeedSales();
    localStorage.setItem(
      STORAGE_KEYS.SALES + '_' + this.currentProfile,
      JSON.stringify(sales)
    );

    // Seed purchases (expense/raw materials ledger)
    const purchases = this.generateSeedPurchases();
    localStorage.setItem(
      STORAGE_KEYS.PURCHASES + '_' + this.currentProfile,
      JSON.stringify(purchases)
    );

    // Seed empty return filings list
    localStorage.setItem(
      STORAGE_KEYS.FILINGS + '_' + this.currentProfile,
      JSON.stringify(this.generateSeedFilings())
    );
  }

  // Generate sales history
  generateSeedSales() {
    const isRetailer = this.currentProfile === 'retailer';
    const clientList = DEFAULT_CUSTOMERS;
    const prodList = DEFAULT_PRODUCTS[this.currentProfile];

    // Create 6 realistic invoice logs for current FY Q1-Q2
    return [
      {
        id: 'INV-2026-001',
        date: '2026-04-12',
        customer: clientList[0],
        items: [
          { product: prodList[0], quantity: 2, rate: prodList[0].price, total: prodList[0].price * 2 }
        ],
        summary: this.calculateSummaryForItems([
          { product: prodList[0], quantity: 2, rate: prodList[0].price }
        ], clientList[0].state === 'Maharashtra'),
        irn: '4c7d0dcf5796b4ef84c7e2c90e0b3c66f56fa689e3a6a9b433eb1f879685a49b',
        qrcode: 'MOCK_QR_CODE_DATA_INV-2026-001',
        eInvoiceStatus: 'Pushed'
      },
      {
        id: 'INV-2026-002',
        date: '2026-04-28',
        customer: clientList[1],
        items: [
          { product: prodList[1], quantity: 5, rate: prodList[1].price, total: prodList[1].price * 5 },
          { product: prodList[2], quantity: 10, rate: prodList[2].price, total: prodList[2].price * 10 }
        ],
        summary: this.calculateSummaryForItems([
          { product: prodList[1], quantity: 5, rate: prodList[1].price },
          { product: prodList[2], quantity: 10, rate: prodList[2].price }
        ], clientList[1].state === 'Maharashtra'), // IGST since Client in Karnataka, Shop is in Maharashtra (Default 27)
        irn: '8ef0a12e52b21c43f7d23a1a9e9b8c66e23fa289e3f6a2b43aeb1a87968512ab',
        qrcode: 'MOCK_QR_CODE_DATA_INV-2026-002',
        eInvoiceStatus: 'Pushed'
      },
      {
        id: 'INV-2026-003',
        date: '2026-05-15',
        customer: clientList[3], // Unregistered person walk-in, Local
        items: [
          { product: prodList[isRetailer ? 2 : 0], quantity: 1, rate: prodList[isRetailer ? 2 : 0].price, total: prodList[isRetailer ? 2 : 0].price }
        ],
        summary: this.calculateSummaryForItems([
          { product: prodList[isRetailer ? 2 : 0], quantity: 1, rate: prodList[isRetailer ? 2 : 0].price }
        ], true),
        irn: null,
        qrcode: null,
        eInvoiceStatus: 'Pending'
      },
      {
        id: 'INV-2026-004',
        date: '2026-05-24',
        customer: clientList[2], // B2B Delhi
        items: [
          { product: prodList[isRetailer ? 3 : 2], quantity: 3, rate: prodList[isRetailer ? 3 : 2].price, total: prodList[isRetailer ? 3 : 2].price * 3 }
        ],
        summary: this.calculateSummaryForItems([
          { product: prodList[isRetailer ? 3 : 2], quantity: 3, rate: prodList[isRetailer ? 3 : 2].price }
        ], false),
        irn: '7cfb0dcf5796b4ef84c7e2c90e0b3c66f56fa689e3a6a9b433eb1f879685c49d',
        qrcode: 'MOCK_QR_CODE_DATA_INV-2026-004',
        eInvoiceStatus: 'Pushed'
      },
      {
        id: 'INV-2026-005',
        date: '2026-06-02',
        customer: clientList[0], // B2B Local
        items: [
          { product: prodList[isRetailer ? 4 : 1], quantity: 4, rate: prodList[isRetailer ? 4 : 1].price, total: prodList[isRetailer ? 4 : 1].price * 4 }
        ],
        summary: this.calculateSummaryForItems([
          { product: prodList[isRetailer ? 4 : 1], quantity: 4, rate: prodList[isRetailer ? 4 : 1].price }
        ], true),
        irn: 'faef1a8df621a221f7d23a1a9e9b8c66e23fa289e3f6a2b43aeb1a879685a62e',
        qrcode: 'MOCK_QR_CODE_DATA_INV-2026-005',
        eInvoiceStatus: 'Pushed'
      },
      {
        id: 'INV-2026-006',
        date: '2026-06-25',
        customer: clientList[3], // Retail client
        items: [
          { product: prodList[isRetailer ? 1 : 0], quantity: 2, rate: prodList[isRetailer ? 1 : 0].price, total: prodList[isRetailer ? 1 : 0].price * 2 }
        ],
        summary: this.calculateSummaryForItems([
          { product: prodList[isRetailer ? 1 : 0], quantity: 2, rate: prodList[isRetailer ? 1 : 0].price }
        ], true),
        irn: null,
        qrcode: null,
        eInvoiceStatus: 'Pending'
      }
    ];
  }

  // Calculate taxes on items for data seeding
  calculateSummaryForItems(items, isLocal) {
    let taxableAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    items.forEach(item => {
      const lineTotal = item.quantity * item.rate;
      taxableAmount += lineTotal;
      const gst = lineTotal * (item.product.gstRate / 100);
      if (isLocal) {
        cgst += gst / 2;
        sgst += gst / 2;
      } else {
        igst += gst;
      }
    });

    const totalGst = cgst + sgst + igst;
    const totalAmount = taxableAmount + totalGst;

    return {
      taxableAmount,
      cgst: Math.round(cgst * 100) / 100,
      sgst: Math.round(sgst * 100) / 100,
      igst: Math.round(igst * 100) / 100,
      totalGst: Math.round(totalGst * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }

  // Generate seed purchases/expenses for Q1 (April - June)
  // Input tax credit (ITC) is accumulated here
  generateSeedPurchases() {
    const isRetailer = this.currentProfile === 'retailer';
    const vendors = DEFAULT_VENDORS;

    if (isRetailer) {
      // Retailer purchases finished goods for resale, plus rent/electricity
      return [
        {
          id: 'PUR-2026-001',
          date: '2026-04-05',
          vendor: vendors[0].name,
          gstin: vendors[0].gstin,
          category: 'Finished Goods Inventory',
          description: 'Procurement of Gaming Laptops & Monitors',
          taxableAmount: 180000,
          cgst: 16200,
          sgst: 16200,
          igst: 0,
          totalAmount: 212400
        },
        {
          id: 'PUR-2026-002',
          date: '2026-05-02',
          vendor: vendors[1].name,
          gstin: vendors[1].gstin,
          category: 'Finished Goods Inventory',
          description: 'Keyboards and Wireless Mice batch buy',
          taxableAmount: 42000,
          cgst: 0,
          sgst: 0,
          igst: 7560, // Delhi to Maharashtra (IGST 18%)
          totalAmount: 49560
        },
        {
          id: 'PUR-2026-003',
          date: '2026-05-28',
          vendor: vendors[2].name,
          gstin: vendors[2].gstin,
          category: 'Utilities',
          description: 'Retail Shop Electricity Bill',
          taxableAmount: 8500,
          cgst: 765,
          sgst: 765,
          igst: 0,
          totalAmount: 10030
        },
        {
          id: 'PUR-2026-004',
          date: '2026-06-10',
          vendor: 'Global Plaza Renting',
          gstin: '27RENT1234D1ZX',
          category: 'Office Rent & Overhead',
          description: 'Commercial Showroom Rent June',
          taxableAmount: 35000,
          cgst: 3150,
          sgst: 3150,
          igst: 0,
          totalAmount: 41300
        }
      ];
    } else {
      // Manufacturer buys raw steel, metals, electronics components, runs factory (fuel/power/labor)
      return [
        {
          id: 'PUR-2026-001',
          date: '2026-04-04',
          vendor: vendors[0].name,
          gstin: vendors[0].gstin,
          category: 'Raw Materials Procurement',
          description: 'Bulk purchase of Steel Plates & Aluminum Ingots',
          taxableAmount: 250000,
          cgst: 22500,
          sgst: 22500,
          igst: 0,
          totalAmount: 295000
        },
        {
          id: 'PUR-2026-002',
          date: '2026-04-20',
          vendor: vendors[1].name,
          gstin: vendors[1].gstin,
          category: 'Electronic Components',
          description: 'Microprocessors and controller components',
          taxableAmount: 110000,
          cgst: 0,
          sgst: 0,
          igst: 19800, // IGST 18%
          totalAmount: 129800
        },
        {
          id: 'PUR-2026-003',
          date: '2026-05-10',
          vendor: vendors[2].name,
          gstin: vendors[2].gstin,
          category: 'Factory Power & Fuel',
          description: 'Industrial high-tension electricity line bill',
          taxableAmount: 48000,
          cgst: 4320,
          sgst: 4320,
          igst: 0,
          totalAmount: 56640
        },
        {
          id: 'PUR-2026-004',
          date: '2026-05-25',
          vendor: vendors[3].name,
          gstin: vendors[3].gstin,
          category: 'Freight & Carriage',
          description: 'Logistics cargo truck charges (finished goods transit)',
          taxableAmount: 24000,
          cgst: 0,
          sgst: 0,
          igst: 4320, // IGST 18%
          totalAmount: 28320
        },
        {
          // Direct manufacturing labor (Usually exempt from GST / reverse charge, but recorded here for ITR manufacturing expenses P&L)
          id: 'PUR-2026-005',
          date: '2026-06-15',
          vendor: 'Direct Labor Contracting',
          gstin: 'URP',
          category: 'Direct Labor Wages',
          description: 'Assembly line manual labor weekly wages',
          taxableAmount: 65000,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalAmount: 65000
        },
        {
          // Machine depreciation / Maintenance
          id: 'PUR-2026-006',
          date: '2026-06-20',
          vendor: 'Precision Tooling Maintenance',
          gstin: '27TOL9999K3Z1',
          category: 'Machinery Maintenance & Consumables',
          description: 'CNC Machine lubrication and tooling calibration',
          taxableAmount: 15000,
          cgst: 1350,
          sgst: 1350,
          igst: 0,
          totalAmount: 17700
        }
      ];
    }
  }

  // Standard Return Filing Log History
  generateSeedFilings() {
    return [
      {
        returnType: 'GSTR-1',
        period: 'Q1 (April - June 2026)',
        dateFiled: '2026-07-10',
        ackNumber: 'ACK-GST1-88923019',
        status: 'Success',
        taxYear: '2026-27'
      },
      {
        returnType: 'GSTR-3B',
        period: 'Q1 (April - June 2026)',
        dateFiled: '2026-07-20',
        ackNumber: 'ACK-GST3B-57129033',
        status: 'Success',
        taxYear: '2026-27'
      }
    ];
  }

  // --- DATABASE API METHODS ---

  getProducts() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PRODUCTS + '_' + this.currentProfile)) || [];
  }

  saveProduct(product) {
    const products = this.getProducts();
    const existingIndex = products.findIndex(p => p.id === product.id);
    if (existingIndex > -1) {
      products[existingIndex] = product;
    } else {
      products.push(product);
    }
    localStorage.setItem(STORAGE_KEYS.PRODUCTS + '_' + this.currentProfile, JSON.stringify(products));
    return products;
  }

  getSales() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SALES + '_' + this.currentProfile)) || [];
  }

  saveSale(invoice) {
    const sales = this.getSales();
    sales.unshift(invoice); // Add new invoices to the top of list
    localStorage.setItem(STORAGE_KEYS.SALES + '_' + this.currentProfile, JSON.stringify(sales));
    return sales;
  }

  updateSaleStatus(invoiceId, field, value) {
    const sales = this.getSales();
    const index = sales.findIndex(s => s.id === invoiceId);
    if (index > -1) {
      sales[index][field] = value;
      localStorage.setItem(STORAGE_KEYS.SALES + '_' + this.currentProfile, JSON.stringify(sales));
    }
    return sales;
  }

  getPurchases() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PURCHASES + '_' + this.currentProfile)) || [];
  }

  savePurchase(purchase) {
    const purchases = this.getPurchases();
    purchases.unshift(purchase);
    localStorage.setItem(STORAGE_KEYS.PURCHASES + '_' + this.currentProfile, JSON.stringify(purchases));
    return purchases;
  }

  getFilings() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.FILINGS + '_' + this.currentProfile)) || [];
  }

  saveFiling(filing) {
    const filings = this.getFilings();
    filings.unshift(filing);
    localStorage.setItem(STORAGE_KEYS.FILINGS + '_' + this.currentProfile, JSON.stringify(filings));
    return filings;
  }

  resetAllData() {
    localStorage.removeItem(STORAGE_KEYS.PRODUCTS + '_' + this.currentProfile);
    localStorage.removeItem(STORAGE_KEYS.SALES + '_' + this.currentProfile);
    localStorage.removeItem(STORAGE_KEYS.PURCHASES + '_' + this.currentProfile);
    localStorage.removeItem(STORAGE_KEYS.FILINGS + '_' + this.currentProfile);
    this.init();
  }
}

// Export a single instance to be used across components
const db = new TaxSystemDatabase();
window.taxDb = db; // Make global for debugging & component access
