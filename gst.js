/**
 * gst.js
 * Performs GST reconciliation, ITC offsets, compiles GSTR returns, and handles simulated filings.
 */

class GstEngine {
  constructor() {
    this.db = window.taxDb;
  }

  /**
   * Summarizes all sales and purchases for a given timeframe to calculate tax liability vs ITC.
   * Period format: "2026-04-01" to "2026-06-30" (Q1)
   */
  getReconciliationData(startDate, endDate) {
    const sales = this.db.getSales();
    const purchases = this.db.getPurchases();

    const start = new Date(startDate);
    const end = new Date(endDate);

    let outwardLiability = { cgst: 0, sgst: 0, igst: 0, taxable: 0, totalTax: 0 };
    let inwardItc = { cgst: 0, sgst: 0, igst: 0, taxable: 0, totalTax: 0 };

    // Filter and compute Outward Tax Liability (Sales)
    sales.forEach(sale => {
      const saleDate = new Date(sale.date);
      if (saleDate >= start && saleDate <= end) {
        outwardLiability.taxable += sale.summary.taxableAmount;
        outwardLiability.cgst += sale.summary.cgst;
        outwardLiability.sgst += sale.summary.sgst;
        outwardLiability.igst += sale.summary.igst;
        outwardLiability.totalTax += sale.summary.totalGst;
      }
    });

    // Filter and compute Input Tax Credit (Purchases/Expenses)
    purchases.forEach(pur => {
      const purDate = new Date(pur.date);
      if (purDate >= start && purDate <= end) {
        inwardItc.taxable += pur.taxableAmount;
        inwardItc.cgst += pur.cgst;
        inwardItc.sgst += pur.sgst;
        inwardItc.igst += pur.igst;
        inwardItc.totalTax += (pur.cgst + pur.sgst + pur.igst);
      }
    });

    // Math roundings
    const roundObj = (obj) => {
      for (let k in obj) {
        obj[k] = Math.round(obj[k] * 100) / 100;
      }
    };
    roundObj(outwardLiability);
    roundObj(inwardItc);

    // Compute Net GST Liability after ITC Offset
    // Formula: Liability - ITC (Calculated by component)
    // CGST offset: CGST credit first, then IGST.
    // SGST offset: SGST credit first, then IGST.
    // IGST offset: IGST credit first, then CGST, then SGST.
    let cgstPayable = Math.max(0, outwardLiability.cgst - inwardItc.cgst);
    let sgstPayable = Math.max(0, outwardLiability.sgst - inwardItc.sgst);
    let igstPayable = Math.max(0, outwardLiability.igst - inwardItc.igst);

    // If there is excess ITC credit remaining
    let cgstCreditBal = Math.max(0, inwardItc.cgst - outwardLiability.cgst);
    let sgstCreditBal = Math.max(0, inwardItc.sgst - outwardLiability.sgst);
    let igstCreditBal = Math.max(0, inwardItc.igst - outwardLiability.igst);

    // Offset IGST payable with remaining CGST/SGST credit (or vice versa according to Indian Offset Rules)
    if (igstPayable > 0 && (cgstCreditBal > 0 || sgstCreditBal > 0)) {
      const offsetCgst = Math.min(igstPayable, cgstCreditBal);
      igstPayable -= offsetCgst;
      cgstCreditBal -= offsetCgst;

      const offsetSgst = Math.min(igstPayable, sgstCreditBal);
      igstPayable -= offsetSgst;
      sgstCreditBal -= offsetSgst;
    }

    if (cgstPayable > 0 && igstCreditBal > 0) {
      const offset = Math.min(cgstPayable, igstCreditBal);
      cgstPayable -= offset;
      igstCreditBal -= offset;
    }

    if (sgstPayable > 0 && igstCreditBal > 0) {
      const offset = Math.min(sgstPayable, igstCreditBal);
      sgstPayable -= offset;
      igstCreditBal -= offset;
    }

    const netTaxPayable = cgstPayable + sgstPayable + igstPayable;
    const carryForwardITC = cgstCreditBal + sgstCreditBal + igstCreditBal;

    return {
      outwardLiability,
      inwardItc,
      netPayable: {
        cgst: Math.round(cgstPayable * 100) / 100,
        sgst: Math.round(sgstPayable * 100) / 100,
        igst: Math.round(igstPayable * 100) / 100,
        total: Math.round(netTaxPayable * 100) / 100
      },
      carryForwardITC: Math.round(carryForwardITC * 100) / 100,
      breakdownCreditBal: {
        cgst: Math.round(cgstCreditBal * 100) / 100,
        sgst: Math.round(sgstCreditBal * 100) / 100,
        igst: Math.round(igstCreditBal * 100) / 100
      }
    };
  }

  /**
   * Compiles GSTR-1 Outward Supplies return payload
   */
  compileGSTR1(startDate, endDate) {
    const sales = this.db.getSales();
    const start = new Date(startDate);
    const end = new Date(endDate);

    let b2b = [];
    let b2c = [];

    sales.forEach(sale => {
      const saleDate = new Date(sale.date);
      if (saleDate >= start && saleDate <= end) {
        const payload = {
          invoiceNo: sale.id,
          invoiceDate: sale.date,
          customerName: sale.customer.name,
          customerGSTIN: sale.customer.gstin,
          taxableValue: sale.summary.taxableAmount,
          cgst: sale.summary.cgst,
          sgst: sale.summary.sgst,
          igst: sale.summary.igst,
          totalAmount: sale.summary.totalAmount
        };

        if (sale.customer.gstin && sale.customer.gstin !== 'URP') {
          b2b.push(payload);
        } else {
          b2c.push(payload);
        }
      }
    });

    return {
      gstin: '27ANTIG1234F1Z9',
      financialYear: '2026-2027',
      period: 'Q1',
      summary: {
        totalB2B: b2b.length,
        totalB2C: b2c.length,
        totalTaxable: b2b.reduce((s, x) => s + x.taxableValue, 0) + b2c.reduce((s, x) => s + x.taxableValue, 0),
        totalTax: b2b.reduce((s, x) => s + (x.cgst+x.sgst+x.igst), 0) + b2c.reduce((s, x) => s + (x.cgst+x.sgst+x.igst), 0)
      },
      tables: {
        table4_B2B: b2b,
        table7_B2CS: b2c
      }
    };
  }

  /**
   * Compiles GSTR-3B Summary Return payload
   */
  compileGSTR3B(startDate, endDate) {
    const recon = this.getReconciliationData(startDate, endDate);

    return {
      gstin: '27ANTIG1234F1Z9',
      financialYear: '2026-2027',
      period: 'Q1',
      tables: {
        table3_1_OutwardSupplies: {
          taxableValue: recon.outwardLiability.taxable,
          cgst: recon.outwardLiability.cgst,
          sgst: recon.outwardLiability.sgst,
          igst: recon.outwardLiability.igst,
          totalTax: recon.outwardLiability.totalTax
        },
        table4_EligibleITC: {
          taxableValue: recon.inwardItc.taxable,
          cgst: recon.inwardItc.cgst,
          sgst: recon.inwardItc.sgst,
          igst: recon.inwardItc.igst,
          totalTax: recon.inwardItc.totalTax
        },
        table6_PaymentOfTax: {
          liabilityCGST: recon.outwardLiability.cgst,
          liabilitySGST: recon.outwardLiability.sgst,
          liabilityIGST: recon.outwardLiability.igst,
          paidThroughITC: {
            cgst: Math.min(recon.outwardLiability.cgst, recon.inwardItc.cgst),
            sgst: Math.min(recon.outwardLiability.sgst, recon.inwardItc.sgst),
            igst: Math.min(recon.outwardLiability.igst, recon.inwardItc.igst)
          },
          paidInCash: recon.netPayable
        }
      }
    };
  }

  /**
   * Sends OTP for filing confirmation.
   */
  sendOTP(email) {
    console.log(`Filing OTP triggered to: ${email}`);
    // Simulate generation of simple 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    window._lastOtp = otp; // Store globally in window for checking
    return {
      success: true,
      message: `OTP successfully dispatched to ${email || 'registered tax mobile number'}.`
    };
  }

  /**
   * Validate OTP and execute mock filing on governmental ledger
   */
  async submitFiling(returnType, period, userOtp) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (userOtp === '123456' || userOtp === window._lastOtp) {
          const ack = 'ACK-' + returnType + '-' + Math.floor(10000000 + Math.random() * 90000000);
          const filingObj = {
            returnType,
            period,
            dateFiled: new Date().toISOString().split('T')[0],
            ackNumber: ack,
            status: 'Success',
            taxYear: '2026-27'
          };
          this.db.saveFiling(filingObj);
          resolve({
            success: true,
            ackNumber: ack,
            date: filingObj.dateFiled
          });
        } else {
          reject(new Error('Invalid verification OTP code. Please try again. (Hint: Enter code sent or use bypass "123456")'));
        }
      }, 1000);
    });
  }
}

const gstEngine = new GstEngine();
window.gstEngine = gstEngine;
