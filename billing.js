/**
 * billing.js
 * Handles tax computations for invoices, HSN lookups, and simulated government e-invoicing.
 */

const COMPANY_PROFILE = {
  name: 'Antigravity Tech & Industrial Solutions',
  gstin: '27ANTIG1234F1Z9', // Maharashtra GSTIN
  state: 'Maharashtra',
  address: '402, Quantum Heights, Sector 15, Vashi, Navi Mumbai, MH - 400703',
  email: 'accounts@antigravity.io'
};

class BillingEngine {
  constructor() {
    this.company = COMPANY_PROFILE;
  }

  /**
   * Calculates taxes and totals for a set of items.
   * @param {Array} items - Array of { product, quantity, discountPercent }
   * @param {String} customerState - State of the buying customer (determines CGST/SGST vs IGST)
   */
  calculateInvoice(items, customerState) {
    const isLocal = (customerState.toLowerCase() === this.company.state.toLowerCase());
    
    let totalTaxable = 0;
    let computedItems = [];
    let taxBreakdown = {
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalGst: 0
    };

    items.forEach(item => {
      const quantity = parseInt(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      const discount = parseFloat(item.discountPercent) || 0;
      
      const rawSubtotal = quantity * rate;
      const discountAmount = rawSubtotal * (discount / 100);
      const taxableValue = rawSubtotal - discountAmount;
      
      const gstRate = parseFloat(item.product.gstRate) || 0;
      const gstAmount = taxableValue * (gstRate / 100);
      
      let cgst = 0, sgst = 0, igst = 0;
      if (isLocal) {
        cgst = gstAmount / 2;
        sgst = gstAmount / 2;
      } else {
        igst = gstAmount;
      }

      totalTaxable += taxableValue;
      taxBreakdown.cgst += cgst;
      taxBreakdown.sgst += sgst;
      taxBreakdown.igst += igst;
      taxBreakdown.totalGst += gstAmount;

      computedItems.push({
        product: item.product,
        quantity,
        rate,
        discountPercent: discount,
        discountAmount: Math.round(discountAmount * 100) / 100,
        taxableValue: Math.round(taxableValue * 100) / 100,
        gstRate,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        igst: Math.round(igst * 100) / 100,
        totalGst: Math.round(gstAmount * 100) / 100,
        total: Math.round((taxableValue + gstAmount) * 100) / 100
      });
    });

    const grandTotal = totalTaxable + taxBreakdown.totalGst;

    return {
      items: computedItems,
      summary: {
        taxableAmount: Math.round(totalTaxable * 100) / 100,
        cgst: Math.round(taxBreakdown.cgst * 100) / 100,
        sgst: Math.round(taxBreakdown.sgst * 100) / 100,
        igst: Math.round(taxBreakdown.igst * 100) / 100,
        totalGst: Math.round(taxBreakdown.totalGst * 100) / 100,
        totalAmount: Math.round(grandTotal * 100) / 100
      }
    };
  }

  /**
   * Simulates a government portal e-invoice registration.
   * Generates IRN, Ack No, and an SVG QR Code.
   */
  async registerEInvoice(invoiceId, invoiceData) {
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        // Generate mock 64-char hex IRN
        const rawString = `${invoiceId}-${Date.now()}-${invoiceData.summary.totalAmount}`;
        let irnHash = '';
        for (let i = 0; i < rawString.length; i++) {
          irnHash += rawString.charCodeAt(i).toString(16);
        }
        // Pad or slice to get 64 chars
        while (irnHash.length < 64) {
          irnHash += Math.random().toString(16).substring(2);
        }
        irnHash = irnHash.substring(0, 64).toLowerCase();

        // Generate Ack Number
        const ackNumber = '100226' + Math.floor(1000000000 + Math.random() * 9000000000);
        const qrContent = `GSTIN:${this.company.gstin}|BuyerGSTIN:${invoiceData.customer.gstin}|Invoice:${invoiceId}|Date:${new Date().toISOString().split('T')[0]}|Value:${invoiceData.summary.totalAmount}|Tax:${invoiceData.summary.totalGst}|IRN:${irnHash.substring(0, 8)}...`;
        
        // Generate a visual QR Code SVG
        const qrSvg = this.generateMockQRCodeSVG(qrContent);

        resolve({
          success: true,
          irn: irnHash,
          ackNumber: ackNumber,
          ackDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
          qrcode: qrSvg
        });
      }, 1000); // 1-second simulation delay
    });
  }

  /**
   * Helper to generate a mockup QR code in SVG representation
   */
  generateMockQRCodeSVG(content) {
    // Generates a mock QR code SVG (matrix of boxes)
    const size = 150;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    svg += `<rect width="100%" height="100%" fill="#ffffff" />`;
    
    // Draw corner markers
    const drawMarker = (x, y) => {
      svg += `<rect x="${x}" y="${y}" width="30" height="30" fill="#1e1e2d" />`;
      svg += `<rect x="${x+5}" y="${y+5}" width="20" height="20" fill="#ffffff" />`;
      svg += `<rect x="${x+9}" y="${y+9}" width="12" height="12" fill="#1e1e2d" />`;
    };
    
    drawMarker(10, 10);
    drawMarker(110, 10);
    drawMarker(10, 110);
    
    // Draw random pixel noise blocks to simulate standard QR structure
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 20; c++) {
        // Skip corner areas
        if ((r < 6 && c < 6) || (r < 6 && c > 13) || (r > 13 && c < 6)) continue;
        
        // Pseudo-random distribution based on character positions
        const charIdx = (r * 20 + c) % content.length;
        const fill = content.charCodeAt(charIdx) % 3 === 0 ? '#1e1e2d' : 'transparent';
        if (fill !== 'transparent') {
          svg += `<rect x="${10 + c*6.5}" y="${10 + r*6.5}" width="5" height="5" fill="${fill}" />`;
        }
      }
    }
    
    svg += `</svg>`;
    return svg;
  }
}

// Export global engine
const billingEngine = new BillingEngine();
window.billingEngine = billingEngine;
