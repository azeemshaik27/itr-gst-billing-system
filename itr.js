/**
 * itr.js
 * Computes business profits (detailed books vs Section 44AD presumptive),
 * runs Old vs New Tax Regime calculations, and simulates ITR filing.
 */

class ItrEngine {
  constructor() {
    this.db = window.taxDb;
  }

  /**
   * Computes P&L statement based on active profile and transactions in the DB.
   */
  computeProfitLoss() {
    const isRetailer = this.db.getProfile() === 'retailer';
    const sales = this.db.getSales();
    const purchases = this.db.getPurchases();

    // 1. Gross Revenue / Turnover
    let grossTurnover = 0;
    let digitalTurnover = 0; // Sales pushed as e-invoices (B2B or digital payments)
    let cashTurnover = 0;

    sales.forEach(sale => {
      grossTurnover += sale.summary.taxableAmount;
      if (sale.eInvoiceStatus === 'Pushed' || (sale.customer && sale.customer.gstin !== 'URP')) {
        digitalTurnover += sale.summary.taxableAmount;
      } else {
        cashTurnover += sale.summary.taxableAmount;
      }
    });

    // 2. Cost of Sales & Expenses
    let materialCost = 0;
    let laborWages = 0;
    let factoryOverheads = 0;
    let operatingOverheads = 0;

    purchases.forEach(pur => {
      const cat = pur.category.toLowerCase();
      const amount = pur.taxableAmount;

      if (cat.includes('raw') || cat.includes('goods') || cat.includes('component')) {
        materialCost += amount;
      } else if (cat.includes('labor') || cat.includes('wage')) {
        laborWages += amount;
      } else if (cat.includes('power') || cat.includes('factory') || cat.includes('maintenance')) {
        factoryOverheads += amount;
      } else {
        operatingOverheads += amount;
      }
    });

    const totalExpenses = materialCost + laborWages + factoryOverheads + operatingOverheads;
    const netProfitStandard = Math.max(0, grossTurnover - totalExpenses);

    // 3. Presumptive Taxation (Sec 44AD) Calculation (Only for Retailers/Small Businesses)
    // 6% of Digital Turnover + 8% of Cash Turnover
    const presumptiveProfit = (digitalTurnover * 0.06) + (cashTurnover * 0.08);

    return {
      grossTurnover: Math.round(grossTurnover),
      breakdownTurnover: {
        digital: Math.round(digitalTurnover),
        cash: Math.round(cashTurnover)
      },
      expenses: {
        materialCost: Math.round(materialCost),
        laborWages: Math.round(laborWages),
        factoryOverheads: Math.round(factoryOverheads),
        operatingOverheads: Math.round(operatingOverheads),
        total: Math.round(totalExpenses)
      },
      netProfitStandard: Math.round(netProfitStandard),
      presumptiveProfit: Math.round(presumptiveProfit),
      isRetailer
    };
  }

  /**
   * Calculates net tax liability under Old and New tax regimes for FY 2026-27.
   * @param {Number} taxableIncome - Profit/Salary income
   * @param {Object} deductions - Deductions dictionary (e.g. { sec80C: 150000, sec80D: 25000 })
   */
  calculateTax(taxableIncome, deductions = {}) {
    const d80C = Math.min(150000, parseFloat(deductions.sec80C) || 0);
    const d80D = Math.min(25000, parseFloat(deductions.sec80D) || 0);
    const d24b = Math.min(200000, parseFloat(deductions.sec24b) || 0);
    const totalDeductions = d80C + d80D + d24b;

    const oldRegimeNetIncome = Math.max(0, taxableIncome - totalDeductions);
    const newRegimeNetIncome = taxableIncome; // No deductions under standard new regime for business profits

    const oldTax = this.computeOldRegimeTax(oldRegimeNetIncome);
    const newTax = this.computeNewRegimeTax(newRegimeNetIncome);

    return {
      income: taxableIncome,
      deductions: {
        sec80C: d80C,
        sec80D: d80D,
        sec24b: d24b,
        total: totalDeductions
      },
      oldRegime: {
        netTaxableIncome: oldRegimeNetIncome,
        taxBeforeCess: oldTax.baseTax,
        rebate: oldTax.rebate,
        cess: oldTax.cess,
        totalTax: oldTax.totalTax
      },
      newRegime: {
        netTaxableIncome: newRegimeNetIncome,
        taxBeforeCess: newTax.baseTax,
        rebate: newTax.rebate,
        cess: newTax.cess,
        totalTax: newTax.totalTax
      },
      betterOption: oldTax.totalTax < newTax.totalTax ? 'Old Regime' : 'New Regime'
    };
  }

  /**
   * India Old Tax Regime calculation rules
   */
  computeOldRegimeTax(income) {
    let tax = 0;
    
    if (income <= 250000) {
      tax = 0;
    } else if (income <= 500000) {
      tax = (income - 250000) * 0.05;
    } else if (income <= 1000000) {
      tax = 12500 + (income - 500000) * 0.20;
    } else {
      tax = 12500 + 100000 + (income - 1000000) * 0.30;
    }

    // Rebate Sec 87A under Old Regime
    // Applicable if total income <= ₹5,00,000. Rebate is 100% of tax up to ₹12,500.
    let rebate = 0;
    if (income <= 500000) {
      rebate = tax;
    }

    const netTax = Math.max(0, tax - rebate);
    const cess = Math.round(netTax * 0.04 * 100) / 100;
    const totalTax = Math.round((netTax + cess) * 100) / 100;

    return { baseTax: Math.round(tax), rebate: Math.round(rebate), cess, totalTax };
  }

  /**
   * India New Tax Regime rules (FY 2026-27 slabs)
   */
  computeNewRegimeTax(income) {
    let tax = 0;

    // Slabs:
    // Up to 3,00,000 : Nil
    // 3,00,001 to 7,00,000 : 5%
    // 7,00,001 to 10,00,000 : 10%
    // 10,00,001 to 12,00,000 : 15%
    // 12,00,001 to 15,00,000 : 20%
    // Above 15,00,000 : 30%
    if (income <= 300000) {
      tax = 0;
    } else if (income <= 700000) {
      tax = (income - 300000) * 0.05;
    } else if (income <= 1000000) {
      tax = 20000 + (income - 700000) * 0.10;
    } else if (income <= 1200000) {
      tax = 20000 + 30000 + (income - 1000000) * 0.15;
    } else if (income <= 1500000) {
      tax = 20000 + 30000 + 30000 + (income - 1200000) * 0.20;
    } else {
      tax = 20000 + 30000 + 30000 + 60000 + (income - 1500000) * 0.30;
    }

    // Rebate Sec 87A under New Regime
    // Applicable if total income <= ₹7,00,000. Rebate is 100% of tax up to ₹20,000.
    let rebate = 0;
    if (income <= 700000) {
      rebate = tax;
    }

    const netTax = Math.max(0, tax - rebate);
    const cess = Math.round(netTax * 0.04 * 100) / 100;
    const totalTax = Math.round((netTax + cess) * 100) / 100;

    return { baseTax: Math.round(tax), rebate: Math.round(rebate), cess, totalTax };
  }

  /**
   * Files ITR simulated return.
   */
  async submitITR(formType, regime, taxableIncome, taxPayable, otp) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (otp === '123456' || otp === window._lastOtp) {
          const ack = 'ITR-ACK-' + Math.floor(20000000 + Math.random() * 80000000);
          const filingObj = {
            returnType: formType,
            period: 'AY 2027-28 (FY 2026-27)',
            dateFiled: new Date().toISOString().split('T')[0],
            ackNumber: ack,
            status: 'Success',
            taxYear: '2026-27',
            details: `Regime: ${regime} | Tax Paid: ₹${taxPayable.toLocaleString()} | Taxable Income: ₹${taxableIncome.toLocaleString()}`
          };
          this.db.saveFiling(filingObj);
          resolve({
            success: true,
            ackNumber: ack,
            date: filingObj.dateFiled
          });
        } else {
          reject(new Error('Invalid verification OTP code. Please check code or use bypass "123456".'));
        }
      }, 1000);
    });
  }
}

const itrEngine = new ItrEngine();
window.itrEngine = itrEngine;
