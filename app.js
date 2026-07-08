/**
 * app.js
 * Controls tabs, routing, profile updates, invoice compilers, ledger additions,
 * filing wizards, modal overlays, and visual analytics charts.
 */

// Global App State
let activeView = 'dashboard';
let currentFilingContext = null; // 'gst' or 'itr'
let currentGstWizardStep = 1;
let currentItrProfitMethod = 'presumptive'; // 'presumptive' or 'standard'

// Invoice Builder Draft State
let invoiceDraftItems = [];
let currentEInvoiceResponse = null;

// Chart.js references
let cashflowChart = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupSidebarNavigation();
  initAppDashboard();
  loadCatalogDropdowns();
  loadCustomerDropdown();
  
  // Set default dates
  document.getElementById('inv-date').valueAsDate = new Date();
  document.getElementById('pur-date').valueAsDate = new Date();

  // Initialize Advanced Authentication and Security Policies
  initAuthSystem();
});

// --- NAVIGATION & VIEWS CONTROLLER ---

function setupSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      triggerView(targetView);
    });
  });
}

function triggerView(viewName) {
  // Update nav active classes
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => {
    if (nav.getAttribute('data-view') === viewName) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  // Switch display elements
  const views = document.querySelectorAll('.app-view');
  views.forEach(v => {
    if (v.getAttribute('id') === `view-${viewName}`) {
      v.classList.add('active');
    } else {
      v.classList.remove('active');
    }
  });

  activeView = viewName;
  refreshViewData(viewName);
}

function refreshViewData(viewName) {
  switch (viewName) {
    case 'dashboard':
      initAppDashboard();
      break;
    case 'billing':
      // Reset invoice builder or refresh dropdown lists
      loadCatalogDropdowns();
      loadCustomerDropdown();
      updateInvoicePreview();
      break;
    case 'purchases':
      renderPurchaseLedgerTable();
      break;
    case 'gst':
      initGstFilingHub();
      break;
    case 'itr':
      initItrFilingHub();
      break;
    case 'products':
      renderCatalogTable();
      break;
    case 'customer-dashboard':
      initCustomerDashboard();
      break;
    case 'customer-invoices':
      renderCustomerInvoicesTable();
      break;
    case 'security':
      renderAuditLogs();
      break;
  }
}

// --- PROFILE PERSONA CONTROLLER ---

function switchProfile(profileType) {
  // Toggle UI buttons
  const rBtn = document.getElementById('btn-profile-retailer');
  const mBtn = document.getElementById('btn-profile-manufacturer');
  
  if (profileType === 'retailer') {
    rBtn.classList.add('active');
    mBtn.classList.remove('active');
  } else {
    mBtn.classList.add('active');
    rBtn.classList.remove('active');
  }

  // Switch database states (which triggers seeding if empty)
  window.taxDb.setProfile(profileType);

  // Dynamic adjustments in content descriptions
  const dashHeading = document.getElementById('dash-heading');
  const dashSubheading = document.getElementById('dash-subheading');
  const itrPresumptiveCard = document.getElementById('itr-presumptive-card');

  if (profileType === 'retailer') {
    dashHeading.textContent = 'Retail Business Dashboard';
    dashSubheading.textContent = 'Real-time sales invoices, GSTR return drafts, and presumptive taxation comparisons (Sec 44AD).';
    if (itrPresumptiveCard) itrPresumptiveCard.style.display = 'flex';
    currentItrProfitMethod = 'presumptive';
  } else {
    dashHeading.textContent = 'Manufacturing Plant Dashboard';
    dashSubheading.textContent = 'Manage raw material procurement, factory floor operational credits, and detailed books of accounts ITR-3.';
    if (itrPresumptiveCard) itrPresumptiveCard.style.display = 'none';
    currentItrProfitMethod = 'standard';
  }

  // Reload lists
  loadCatalogDropdowns();
  loadCustomerDropdown();
  clearBillingForm();
  
  // Refresh current view
  triggerView(activeView);
}

// --- DASHBOARD VIEW LOGIC ---

function initAppDashboard() {
  const profile = window.taxDb.getProfile();
  const sales = window.taxDb.getSales();
  const purchases = window.taxDb.getPurchases();
  
  // 1. KPI Calculations (for FY Q1: April - June 2026)
  let salesVol = 0;
  let itcVol = 0;
  
  sales.forEach(s => {
    salesVol += s.summary.taxableAmount;
  });

  purchases.forEach(p => {
    // Cumulative ITC value is CGST + SGST + IGST
    itcVol += (p.cgst + p.sgst + p.igst);
  });

  // Calculate Net GST using the reconciliation module
  const recon = window.gstEngine.getReconciliationData('2026-04-01', '2026-06-30');
  const profitReport = window.itrEngine.computeProfitLoss();

  // Inject KPIs into cards
  document.getElementById('kpi-sales').textContent = '₹' + Math.round(salesVol).toLocaleString('en-IN');
  document.getElementById('kpi-itc').textContent = '₹' + Math.round(itcVol).toLocaleString('en-IN');
  
  const gstPay = document.getElementById('kpi-gst-liability');
  if (recon.netPayable.total > 0) {
    gstPay.textContent = '₹' + Math.round(recon.netPayable.total).toLocaleString('en-IN');
    document.getElementById('kpi-gst-liability-desc').textContent = 'Net Cash Payable (Pending)';
    gstPay.style.color = 'var(--color-warning)';
  } else {
    gstPay.textContent = '₹0';
    document.getElementById('kpi-gst-liability-desc').textContent = `ITC surplus carry forward: ₹${Math.round(recon.carryForwardITC).toLocaleString('en-IN')}`;
    gstPay.style.color = 'var(--color-success)';
  }

  const profitVal = document.getElementById('kpi-profit');
  if (profile === 'retailer') {
    profitVal.textContent = '₹' + Math.round(profitReport.presumptiveProfit).toLocaleString('en-IN');
    document.getElementById('kpi-profit-type').textContent = 'Presumptive Basis (Section 44AD)';
  } else {
    profitVal.textContent = '₹' + Math.round(profitReport.netProfitStandard).toLocaleString('en-IN');
    document.getElementById('kpi-profit-type').textContent = 'Standard P&L Books Profit';
  }

  // 2. Render Sales/Invoices Table
  const salesTbody = document.getElementById('dash-sales-tbody');
  salesTbody.innerHTML = '';
  
  if (sales.length === 0) {
    salesTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No sales invoices registered.</td></tr>';
  } else {
    sales.slice(0, 5).forEach(sale => {
      const isPending = sale.eInvoiceStatus === 'Pending';
      const statusBadge = isPending 
        ? '<span class="badge badge-warning">Draft (Pending)</span>' 
        : `<span class="badge badge-success" title="IRN: ${sale.irn}">E-Way Verified</span>`;
      
      const actionBtn = isPending 
        ? `<button class="btn btn-sm btn-teal" onclick="loadInvoiceToBillTab('${sale.id}')"><i class="fa-solid fa-cloud-arrow-up"></i> Register</button>`
        : `<button class="btn btn-sm" onclick="loadInvoiceToBillTab('${sale.id}')"><i class="fa-solid fa-eye"></i> View</button>`;

      salesTbody.innerHTML += `
        <tr>
          <td><strong>${sale.id}</strong></td>
          <td>${sale.date}</td>
          <td>${sale.customer.name}</td>
          <td>₹${sale.summary.taxableAmount.toLocaleString('en-IN')}</td>
          <td>GST ${sale.summary.totalGst > 0 ? ('₹' + sale.summary.totalGst.toLocaleString('en-IN')) : 'Exempt'}</td>
          <td>${statusBadge}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    });
  }

  // 3. Render Government Filings table
  const filingsTbody = document.getElementById('dash-filings-tbody');
  filingsTbody.innerHTML = '';
  const filings = window.taxDb.getFilings();
  
  // Set default expected logs
  const filingsToRender = [
    { name: 'GSTR-1 (Sales)', period: 'Q1 (April - June 2026)', key: 'GSTR-1' },
    { name: 'GSTR-3B (Summary)', period: 'Q1 (April - June 2026)', key: 'GSTR-3B' },
    { name: 'ITR-3 / ITR-4 (Income)', period: 'AY 2027-28', key: 'ITR' }
  ];

  filingsToRender.forEach(req => {
    // Search in DB filings logs
    const match = filings.find(f => f.returnType.startsWith(req.key));
    const statusTag = match 
      ? `<span class="badge badge-success"><i class="fa-solid fa-square-check"></i> Filed (${match.dateFiled})</span>`
      : `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Pending Submission</span>`;
    
    filingsTbody.innerHTML += `
      <tr>
        <td><strong>${req.name}</strong></td>
        <td>${req.period}</td>
        <td>${statusTag}</td>
      </tr>
    `;
  });

  // 4. Render Cashflow Chart
  renderCashflowAnalytics();
}

function renderCashflowAnalytics() {
  const sales = window.taxDb.getSales();
  const purchases = window.taxDb.getPurchases();
  
  // Map monthly volumes for April, May, June
  const monthNames = ['April 2026', 'May 2026', 'June 2026'];
  const salesData = [0, 0, 0];
  const purchaseData = [0, 0, 0];

  sales.forEach(s => {
    const m = new Date(s.date).getMonth();
    if (m === 3) salesData[0] += s.summary.taxableAmount; // April is month 3 (0-indexed)
    if (m === 4) salesData[1] += s.summary.taxableAmount; // May
    if (m === 5) salesData[2] += s.summary.taxableAmount; // June
  });

  purchases.forEach(p => {
    const m = new Date(p.date).getMonth();
    if (m === 3) purchaseData[0] += p.taxableAmount;
    if (m === 4) purchaseData[1] += p.taxableAmount;
    if (m === 5) purchaseData[2] += p.taxableAmount;
  });

  // Destroy previous chart if exists
  if (cashflowChart) {
    cashflowChart.destroy();
  }

  const ctx = document.getElementById('cashflowChart').getContext('2d');
  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthNames,
      datasets: [
        {
          label: 'Sales Output Revenue (₹)',
          data: salesData,
          backgroundColor: '#000000',
          borderRadius: 0
        },
        {
          label: 'Purchases/Material Costs (₹)',
          data: purchaseData,
          backgroundColor: '#cccccc',
          borderRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#000000', font: { family: 'Inter', size: 11, weight: '600' } }
        }
      },
      scales: {
        x: {
          grid: { color: '#eeeeee' },
          ticks: { color: '#333333', font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: '#eeeeee' },
          ticks: { color: '#333333', font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

// --- BILLING MODULE LOGIC ---

function loadCatalogDropdowns() {
  const select = document.getElementById('inv-product-select');
  select.innerHTML = '';
  const products = window.taxDb.getProducts();
  
  products.forEach(p => {
    select.innerHTML += `<option value="${p.id}">${p.name} (₹${p.price} | GST ${p.gstRate}%)</option>`;
  });
}

function loadCustomerDropdown() {
  const select = document.getElementById('inv-customer');
  select.innerHTML = '';
  DEFAULT_CUSTOMERS.forEach((c, index) => {
    select.innerHTML += `<option value="${index}">${c.name}</option>`;
  });
  loadCustomerInfo();
}

function loadCustomerInfo() {
  const idx = document.getElementById('inv-customer').value;
  const cust = DEFAULT_CUSTOMERS[idx];
  document.getElementById('inv-cust-gstin').value = cust.gstin;
  document.getElementById('inv-cust-state').value = cust.state;
  updateInvoicePreview();
}

function addBillingLineItem() {
  const pId = document.getElementById('inv-product-select').value;
  const qty = parseInt(document.getElementById('inv-qty').value) || 1;
  const disc = parseFloat(document.getElementById('inv-disc').value) || 0;

  const product = window.taxDb.getProducts().find(p => p.id === pId);
  if (!product) return;

  // Add item to draft array
  invoiceDraftItems.push({
    product,
    quantity: qty,
    rate: product.price,
    discountPercent: disc
  });

  // Reset item selectors
  document.getElementById('inv-qty').value = 1;
  document.getElementById('inv-disc').value = 0;

  renderInvoiceItemsRows();
  updateInvoicePreview();
}

function deleteBillingLineItem(idx) {
  invoiceDraftItems.splice(idx, 1);
  renderInvoiceItemsRows();
  updateInvoicePreview();
}

function renderInvoiceItemsRows() {
  const container = document.getElementById('added-items-container');
  container.innerHTML = '';

  if (invoiceDraftItems.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 12px;">No items added to invoice draft yet.</p>';
    document.getElementById('btn-einvoice-register').disabled = true;
    return;
  }

  // Allow e-invoice only if items are added
  document.getElementById('btn-einvoice-register').disabled = false;

  invoiceDraftItems.forEach((item, idx) => {
    const rowVal = item.quantity * item.rate;
    const itemTotal = rowVal - (rowVal * (item.discountPercent / 100));
    
    container.innerHTML += `
      <div class="added-item-row">
        <div>
          <div class="added-item-name">${item.product.name}</div>
          <div class="added-item-sub">HSN: ${item.product.hsn} | GST: ${item.product.gstRate}%</div>
        </div>
        <div style="font-size:12px;">Qty: <strong>${item.quantity}</strong></div>
        <div style="font-size:12px;">Rate: ₹${item.rate}</div>
        <div style="font-size:12px; font-weight:600; text-align:right;">₹${Math.round(itemTotal).toLocaleString('en-IN')}</div>
        <div>
          <button class="delete-item-btn" onclick="deleteBillingLineItem(${idx})"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
  });
}

function updateInvoicePreview() {
  const cIdx = document.getElementById('inv-customer').value;
  const customer = DEFAULT_CUSTOMERS[cIdx];
  const dateStr = document.getElementById('inv-date').value;

  // Header & Profile values
  const profile = window.taxDb.getProfile();
  document.getElementById('receipt-comp-name').textContent = profile === 'retailer' ? 'Antigravity Retail Plaza' : 'Antigravity Manufacturing Ltd';
  document.getElementById('receipt-to-name').textContent = customer.name;
  document.getElementById('receipt-to-gstin').textContent = 'GSTIN: ' + customer.gstin;
  document.getElementById('receipt-to-state').textContent = 'Place of Supply: ' + customer.state;
  document.getElementById('receipt-inv-date').textContent = dateStr;

  const results = window.billingEngine.calculateInvoice(invoiceDraftItems, customer.state);
  
  // Render invoice items body
  const tbody = document.getElementById('receipt-items-tbody');
  tbody.innerHTML = '';

  if (results.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; font-size: 12px; padding: 20px;">Add items to preview bill totals</td></tr>';
    document.getElementById('receipt-subtotal').textContent = '₹0.00';
    document.getElementById('receipt-tax-value').textContent = '₹0.00';
    document.getElementById('receipt-grand-total').textContent = '₹0.00';
    return;
  }

  results.items.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>
          <strong>${item.product.name}</strong><br>
          <span style="font-size: 10px; color: #64748b;">HSN: ${item.product.hsn}</span>
        </td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: center;">₹${item.rate.toLocaleString('en-IN')}</td>
        <td style="text-align: center;">₹${item.taxableValue.toLocaleString('en-IN')}</td>
        <td style="text-align: center;">${item.gstRate}%</td>
        <td style="text-align: right; font-weight: 600;">₹${item.total.toLocaleString('en-IN')}</td>
      </tr>
    `;
  });

  // Calculate taxes SGST vs IGST
  const isLocal = customer.state.toLowerCase() === 'maharashtra';
  const taxLabel = document.getElementById('receipt-tax-lbl');
  
  if (isLocal) {
    taxLabel.textContent = `CGST (${results.summary.cgst > 0 ? '9%' : '0%'}) + SGST (${results.summary.sgst > 0 ? '9%' : '0%'}):`;
    document.getElementById('receipt-tax-value').textContent = `₹${(results.summary.cgst + results.summary.sgst).toLocaleString('en-IN')}`;
  } else {
    taxLabel.textContent = `IGST (${results.summary.igst > 0 ? '18%' : '0%'}):`;
    document.getElementById('receipt-tax-value').textContent = `₹${results.summary.igst.toLocaleString('en-IN')}`;
  }

  document.getElementById('receipt-subtotal').textContent = `₹${results.summary.taxableAmount.toLocaleString('en-IN')}`;
  document.getElementById('receipt-grand-total').textContent = `₹${results.summary.totalAmount.toLocaleString('en-IN')}`;
}

async function registerEInvoiceDraft() {
  const cIdx = document.getElementById('inv-customer').value;
  const customer = DEFAULT_CUSTOMERS[cIdx];
  
  if (invoiceDraftItems.length === 0) return;
  
  const results = window.billingEngine.calculateInvoice(invoiceDraftItems, customer.state);

  // Show loading indicators
  const btn = document.getElementById('btn-einvoice-register');
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> Registering...`;
  btn.disabled = true;

  try {
    const tempInvId = 'INV-26-' + Math.floor(1000 + Math.random() * 9000);
    const response = await window.billingEngine.registerEInvoice(tempInvId, {
      customer,
      summary: results.summary
    });

    currentEInvoiceResponse = response;
    
    // Inject into preview SVG and info blocks
    document.getElementById('receipt-gov-panel').style.display = 'flex';
    document.getElementById('receipt-gov-qr').innerHTML = response.qrcode;
    document.getElementById('receipt-ack-no').textContent = response.ackNumber;
    document.getElementById('receipt-ack-date').textContent = response.ackDate;
    document.getElementById('receipt-irn-no').textContent = response.irn;

    // Play visual feedback glow
    const section = document.getElementById('invoice-preview-section');
    section.style.border = '2px solid var(--color-success)';
    setTimeout(() => {
      section.style.border = 'none';
    }, 1500);

  } catch (err) {
    alert(err.message);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

function submitBillingDraft() {
  const cIdx = document.getElementById('inv-customer').value;
  const customer = DEFAULT_CUSTOMERS[cIdx];
  const dateStr = document.getElementById('inv-date').value;

  if (invoiceDraftItems.length === 0) {
    alert('Please add at least one line item to save invoice.');
    return;
  }

  const calculations = window.billingEngine.calculateInvoice(invoiceDraftItems, customer.state);
  const invId = 'INV-2026-' + Math.floor(10000 + Math.random() * 90000);

  const invoiceLog = {
    id: invId,
    date: dateStr,
    customer,
    items: invoiceDraftItems,
    summary: calculations.summary,
    irn: currentEInvoiceResponse ? currentEInvoiceResponse.irn : null,
    qrcode: currentEInvoiceResponse ? currentEInvoiceResponse.qrcode : null,
    eInvoiceStatus: currentEInvoiceResponse ? 'Pushed' : 'Pending'
  };

  window.taxDb.saveSale(invoiceLog);
  alert(`Invoice ${invId} successfully recorded and saved to ledger!`);
  
  // Clear layout
  clearBillingForm();
  triggerView('dashboard');
}

function clearBillingForm() {
  invoiceDraftItems = [];
  currentEInvoiceResponse = null;
  document.getElementById('receipt-gov-panel').style.display = 'none';
  document.getElementById('receipt-gov-qr').innerHTML = '';
  document.getElementById('receipt-ack-no').textContent = '-';
  document.getElementById('receipt-ack-date').textContent = '-';
  document.getElementById('receipt-irn-no').textContent = '-';
  
  renderInvoiceItemsRows();
  updateInvoicePreview();
}

function loadInvoiceToBillTab(invoiceId) {
  const sale = window.taxDb.getSales().find(s => s.id === invoiceId);
  if (!sale) return;

  // Change view to billing tab
  triggerView('billing');

  // Fill in invoice date and customer
  document.getElementById('inv-date').value = sale.date;
  const custIndex = DEFAULT_CUSTOMERS.findIndex(c => c.gstin === sale.customer.gstin);
  if (custIndex > -1) {
    document.getElementById('inv-customer').value = custIndex;
    loadCustomerInfo();
  }

  // Pre-fill line items
  invoiceDraftItems = sale.items.map(item => ({
    product: item.product,
    quantity: item.quantity,
    rate: item.rate,
    discountPercent: item.discountPercent || 0
  }));

  renderInvoiceItemsRows();

  // If already has E-invoice details
  if (sale.eInvoiceStatus === 'Pushed') {
    currentEInvoiceResponse = {
      irn: sale.irn,
      ackNumber: '100226' + Math.floor(1000000000 + Math.random() * 9000000000),
      ackDate: sale.date + ' 10:14:22',
      qrcode: window.billingEngine.generateMockQRCodeSVG(`INV:${sale.id}|IRN:${sale.irn.substring(0, 8)}`)
    };
    
    document.getElementById('receipt-gov-panel').style.display = 'flex';
    document.getElementById('receipt-gov-qr').innerHTML = currentEInvoiceResponse.qrcode;
    document.getElementById('receipt-ack-no').textContent = currentEInvoiceResponse.ackNumber;
    document.getElementById('receipt-ack-date').textContent = currentEInvoiceResponse.ackDate;
    document.getElementById('receipt-irn-no').textContent = currentEInvoiceResponse.irn;
  } else {
    document.getElementById('receipt-gov-panel').style.display = 'none';
  }

  document.getElementById('receipt-inv-id').textContent = sale.id;
  updateInvoicePreview();
}

// --- PURCHASES LEDGER CODE ---

function calculatePurchaseTax() {
  const taxable = parseFloat(document.getElementById('pur-taxable').value) || 0;
  const rate = parseFloat(document.getElementById('pur-gst-rate').value) || 0;
  
  const gst = taxable * (rate / 100);
  const total = taxable + gst;

  document.getElementById('pur-calc-gst').textContent = '₹' + Math.round(gst).toLocaleString('en-IN');
  document.getElementById('pur-calc-total').textContent = '₹' + Math.round(total).toLocaleString('en-IN');
}

function submitPurchaseVoucher() {
  const vendor = document.getElementById('pur-vendor').value.trim();
  const gstin = document.getElementById('pur-gstin').value.trim() || 'URP';
  const dateStr = document.getElementById('pur-date').value;
  const category = document.getElementById('pur-cat').value;
  const taxable = parseFloat(document.getElementById('pur-taxable').value);
  const rate = parseFloat(document.getElementById('pur-gst-rate').value);
  const desc = document.getElementById('pur-desc').value.trim();

  if (!vendor || isNaN(taxable) || taxable <= 0) {
    alert('Please enter valid vendor and taxable value.');
    return;
  }

  // Determine split (Local purchase from Maharashtra vs interstate IGST)
  // Assume interstate if GSTIN does not start with '27' (and isn't URP)
  const isLocal = gstin === 'URP' || gstin.startsWith('27');
  const gstVal = taxable * (rate / 100);
  
  const cgst = isLocal ? (gstVal / 2) : 0;
  const sgst = isLocal ? (gstVal / 2) : 0;
  const igst = isLocal ? 0 : gstVal;

  const voucherId = 'PUR-2026-' + Math.floor(1000 + Math.random() * 9000);

  const purchaseVoucher = {
    id: voucherId,
    date: dateStr,
    vendor,
    gstin,
    category,
    description: desc || category,
    taxableAmount: taxable,
    cgst,
    sgst,
    igst,
    totalAmount: taxable + gstVal
  };

  window.taxDb.savePurchase(purchaseVoucher);
  alert(`Voucher ${voucherId} logged successfully into Purchase credit ledger!`);

  // Reset form
  document.getElementById('pur-vendor').value = '';
  document.getElementById('pur-gstin').value = '';
  document.getElementById('pur-taxable').value = '';
  document.getElementById('pur-desc').value = '';
  calculatePurchaseTax();
  
  renderPurchaseLedgerTable();
}

function renderPurchaseLedgerTable() {
  const tbody = document.getElementById('purchase-ledger-tbody');
  tbody.innerHTML = '';
  const purchases = window.taxDb.getPurchases();

  if (purchases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No purchases logged.</td></tr>';
    return;
  }

  purchases.forEach(p => {
    const cgstSgstStr = p.cgst > 0 ? `CGST: ₹${p.cgst.toLocaleString('en-IN')}<br>SGST: ₹${p.sgst.toLocaleString('en-IN')}` : '';
    const igstStr = p.igst > 0 ? `IGST: ₹${p.igst.toLocaleString('en-IN')}` : '';
    const gstComponents = cgstSgstStr || igstStr || 'Exempt / Zero';

    tbody.innerHTML += `
      <tr>
        <td><strong>${p.id}</strong></td>
        <td>${p.date}</td>
        <td>
          <span style="font-weight:600;">${p.vendor}</span><br>
          <span style="font-size:10px; color:var(--text-muted);">${p.category}</span>
        </td>
        <td>₹${p.taxableAmount.toLocaleString('en-IN')}</td>
        <td>${gstComponents}</td>
        <td style="font-weight:600;">₹${p.totalAmount.toLocaleString('en-IN')}</td>
      </tr>
    `;
  });
}

// --- GST FILING WIZARD SYSTEM ---

function initGstFilingHub() {
  const start = '2026-04-01';
  const end = '2026-06-30';

  const recon = window.gstEngine.getReconciliationData(start, end);
  
  // Update header summary numbers
  document.getElementById('gst-rec-liability').textContent = '₹' + Math.round(recon.outwardLiability.totalTax).toLocaleString('en-IN');
  document.getElementById('gst-rec-itc').textContent = '₹' + Math.round(recon.inwardItc.totalTax).toLocaleString('en-IN');
  document.getElementById('gst-rec-payable').textContent = '₹' + Math.round(recon.netPayable.total).toLocaleString('en-IN');
  document.getElementById('gst-rec-carry').textContent = '₹' + Math.round(recon.carryForwardITC).toLocaleString('en-IN');

  // Load Wizard Step components
  compileGstr1Ui(start, end);
  compileGstr3bUi(start, end);
  compileGstOffsetUi(recon);

  // Check if filed
  const filings = window.taxDb.getFilings();
  const alreadyFiled = filings.some(f => f.returnType === 'GSTR-3B' && f.period.includes('Q1'));
  
  if (alreadyFiled) {
    const matchedFiling = filings.find(f => f.returnType === 'GSTR-3B' && f.period.includes('Q1'));
    showGstSuccessView(matchedFiling.ackNumber, matchedFiling.dateFiled);
  } else {
    resetGstWizard();
  }
}

function compileGstr1Ui(start, end) {
  const report = window.gstEngine.compileGSTR1(start, end);
  document.getElementById('gst1-cnt-b2b').textContent = report.summary.totalB2B;
  document.getElementById('gst1-cnt-b2c').textContent = report.summary.totalB2C;
  document.getElementById('gst1-taxable').textContent = '₹' + Math.round(report.summary.totalTaxable).toLocaleString('en-IN');
  document.getElementById('gst1-tax').textContent = '₹' + Math.round(report.summary.totalTax).toLocaleString('en-IN');

  // Load table
  const tbody = document.getElementById('gst-gstr1-tbody');
  tbody.innerHTML = '';
  
  const allInv = [...report.tables.table4_B2B, ...report.tables.table7_B2CS];
  if (allInv.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No sales invoices in compilation range.</td></tr>';
  } else {
    allInv.forEach(row => {
      const typeBadge = row.customerGSTIN !== 'URP' 
        ? '<span class="badge badge-info">B2B</span>' 
        : '<span class="badge badge-success">B2C</span>';
      
      const totalTax = row.cgst + row.sgst + row.igst;
      tbody.innerHTML += `
        <tr>
          <td><strong>${row.invoiceNo}</strong></td>
          <td>${row.customerName}</td>
          <td>${typeBadge}</td>
          <td>₹${row.taxableValue.toLocaleString('en-IN')}</td>
          <td>₹${Math.round(totalTax).toLocaleString('en-IN')}</td>
        </tr>
      `;
    });
  }
}

function compileGstr3bUi(start, end) {
  const report = window.gstEngine.compileGSTR3B(start, end);
  
  // Table 3.1 Outward Liability
  document.getElementById('gst3b-out-taxable').textContent = '₹' + Math.round(report.tables.table3_1_OutwardSupplies.taxableValue).toLocaleString('en-IN');
  document.getElementById('gst3b-out-cgst').textContent = '₹' + Math.round(report.tables.table3_1_OutwardSupplies.cgst).toLocaleString('en-IN');
  document.getElementById('gst3b-out-sgst').textContent = '₹' + Math.round(report.tables.table3_1_OutwardSupplies.sgst).toLocaleString('en-IN');
  document.getElementById('gst3b-out-igst').textContent = '₹' + Math.round(report.tables.table3_1_OutwardSupplies.igst).toLocaleString('en-IN');

  // Table 4 Inward ITC
  document.getElementById('gst3b-in-taxable').textContent = '₹' + Math.round(report.tables.table4_EligibleITC.taxableValue).toLocaleString('en-IN');
  document.getElementById('gst3b-in-cgst').textContent = '₹' + Math.round(report.tables.table4_EligibleITC.cgst).toLocaleString('en-IN');
  document.getElementById('gst3b-in-sgst').textContent = '₹' + Math.round(report.tables.table4_EligibleITC.sgst).toLocaleString('en-IN');
  document.getElementById('gst3b-in-igst').textContent = '₹' + Math.round(report.tables.table4_EligibleITC.igst).toLocaleString('en-IN');
}

function compileGstOffsetUi(recon) {
  document.getElementById('gst-file-out').textContent = '₹' + Math.round(recon.outwardLiability.totalTax).toLocaleString('en-IN');
  document.getElementById('gst-file-itc').textContent = '-₹' + Math.round(recon.outwardLiability.totalTax - recon.netPayable.total).toLocaleString('en-IN');
  document.getElementById('gst-file-cash').textContent = '₹' + Math.round(recon.netPayable.total).toLocaleString('en-IN');
}

function switchGstWizardStep(stepNum) {
  currentGstWizardStep = stepNum;
  
  // Tabs update
  for (let s = 1; s <= 3; s++) {
    const tab = document.getElementById(`gst-step-tab-${s}`);
    const panel = document.getElementById(`gst-step-panel-${s}`);
    
    if (s === stepNum) {
      tab.classList.add('active');
      panel.classList.add('active');
    } else {
      tab.classList.remove('active');
      panel.classList.remove('active');
    }
  }

  // Buttons update
  document.getElementById('btn-gst-wizard-prev').disabled = stepNum === 1;
  const nextBtn = document.getElementById('btn-gst-wizard-next');
  if (stepNum === 3) {
    nextBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Authorize filing`;
    nextBtn.className = 'btn btn-primary';
  } else {
    nextBtn.innerHTML = `Next <i class="fa-solid fa-arrow-right"></i>`;
    nextBtn.className = 'btn btn-primary';
  }
}

function moveGstWizard(dir) {
  const newStep = currentGstWizardStep + dir;
  if (newStep === 4) {
    // Attempt authorize on step 3 next click
    triggerGstOTPDispatch();
    return;
  }
  if (newStep >= 1 && newStep <= 3) {
    switchGstWizardStep(newStep);
  }
}

function triggerGstOTPDispatch() {
  const email = document.getElementById('gst-signatory-email').value;
  if (!email.includes('@')) {
    alert('Please enter a valid signatory email to receive OTP verification.');
    return;
  }

  currentFilingContext = 'gst';
  
  // Trigger OTP dispatch in Engine
  const res = window.gstEngine.sendOTP(email);
  if (res.success) {
    openOtpModal();
  }
}

function showGstSuccessView(ack, date) {
  document.getElementById('gst-filing-action-view').style.display = 'none';
  document.getElementById('gst-filing-success-view').style.display = 'block';
  document.getElementById('gst-wizard-footer').style.display = 'none';

  const recon = window.gstEngine.getReconciliationData('2026-04-01', '2026-06-30');
  
  document.getElementById('gst-receipt-box').innerHTML = `
    <div class="receipt-row"><strong>Return Reference:</strong> <span>GSTR-3B</span></div>
    <div class="receipt-row"><strong>Acknowledgement No:</strong> <span>${ack}</span></div>
    <div class="receipt-row"><strong>Submission Date:</strong> <span>${date}</span></div>
    <div class="receipt-row"><strong>Filing Period:</strong> <span>Q1 (April - June 2026)</span></div>
    <div class="receipt-row"><strong>Tax Settled:</strong> <span>₹${Math.round(recon.netPayable.total).toLocaleString('en-IN')} Cash</span></div>
    <div class="receipt-row"><strong>Surplus Credit Rollover:</strong> <span>₹${Math.round(recon.carryForwardITC).toLocaleString('en-IN')}</span></div>
  `;
}

function resetGstWizard() {
  document.getElementById('gst-filing-action-view').style.display = 'block';
  document.getElementById('gst-filing-success-view').style.display = 'none';
  document.getElementById('gst-wizard-footer').style.display = 'flex';
  switchGstWizardStep(1);
}

// --- ITR CALCULATIONS AND FILINGS ---

function initItrFilingHub() {
  loadItrProfitDetails();
  
  // Check if filed
  const filings = window.taxDb.getFilings();
  const match = filings.find(f => f.returnType.startsWith('ITR'));
  
  if (match) {
    showItrSuccessView(match.ackNumber, match.dateFiled, match.details);
  } else {
    document.getElementById('itr-filing-wizard-form').style.display = 'block';
    document.getElementById('itr-filing-success-view').style.display = 'none';
  }
}

function loadItrProfitDetails() {
  const profile = window.taxDb.getProfile();
  
  if (profile === 'retailer') {
    currentItrProfitMethod = document.getElementById('itr-profit-method').value;
  } else {
    currentItrProfitMethod = 'standard';
  }

  const pnl = window.itrEngine.computeProfitLoss();

  // Ingest turnover numbers
  document.getElementById('itr-calc-turnover').textContent = '₹' + pnl.grossTurnover.toLocaleString('en-IN');
  
  // Configure visible sections
  const stdRows = document.getElementById('itr-breakdown-standard-rows');
  const presRows = document.getElementById('itr-breakdown-presumptive-rows');

  let netDeclaredProfit = 0;

  if (currentItrProfitMethod === 'standard') {
    stdRows.style.display = 'block';
    if (presRows) presRows.style.display = 'none';

    document.getElementById('itr-calc-mats').textContent = '-₹' + pnl.expenses.materialCost.toLocaleString('en-IN');
    document.getElementById('itr-calc-labor').textContent = '-₹' + pnl.expenses.laborWages.toLocaleString('en-IN');
    document.getElementById('itr-calc-factory').textContent = '-₹' + pnl.expenses.factoryOverheads.toLocaleString('en-IN');
    document.getElementById('itr-calc-office').textContent = '-₹' + pnl.expenses.operatingOverheads.toLocaleString('en-IN');
    
    netDeclaredProfit = pnl.netProfitStandard;
  } else {
    stdRows.style.display = 'none';
    if (presRows) presRows.style.display = 'block';

    const digitalProfit = pnl.breakdownTurnover.digital * 0.06;
    const cashProfit = pnl.breakdownTurnover.cash * 0.08;

    document.getElementById('itr-calc-digital-to').textContent = `₹${pnl.breakdownTurnover.digital.toLocaleString('en-IN')} (declared profit ₹${Math.round(digitalProfit).toLocaleString('en-IN')})`;
    document.getElementById('itr-calc-cash-to').textContent = `₹${pnl.breakdownTurnover.cash.toLocaleString('en-IN')} (declared profit ₹${Math.round(cashProfit).toLocaleString('en-IN')})`;

    netDeclaredProfit = pnl.presumptiveProfit;
  }

  document.getElementById('itr-calc-net-profit').textContent = '₹' + Math.round(netDeclaredProfit).toLocaleString('en-IN');

  recomputeRegimeTaxes(netDeclaredProfit);
}

function recomputeRegimeTaxes(profitOverride) {
  let profitVal = profitOverride;
  if (profitVal === undefined) {
    const pnl = window.itrEngine.computeProfitLoss();
    profitVal = currentItrProfitMethod === 'standard' ? pnl.netProfitStandard : pnl.presumptiveProfit;
  }

  // Read deductions inputs
  const c80C = parseFloat(document.getElementById('ded-80c').value) || 0;
  const d80D = parseFloat(document.getElementById('ded-80d').value) || 0;
  const d24b = parseFloat(document.getElementById('ded-24b').value) || 0;

  const result = window.itrEngine.calculateTax(profitVal, { sec80C: c80C, sec80D: d80D, sec24b: d24b });

  // Update Old Regime UI Panel
  document.getElementById('tax-old').textContent = '₹' + Math.round(result.oldRegime.totalTax).toLocaleString('en-IN');
  document.getElementById('tax-old-gross').textContent = '₹' + Math.round(result.income).toLocaleString('en-IN');
  document.getElementById('tax-old-deduct').textContent = '-₹' + Math.round(result.deductions.total).toLocaleString('en-IN');
  document.getElementById('tax-old-net').textContent = '₹' + Math.round(result.oldRegime.netTaxableIncome).toLocaleString('en-IN');
  document.getElementById('tax-old-base').textContent = '₹' + Math.round(result.oldRegime.taxBeforeCess).toLocaleString('en-IN');
  document.getElementById('tax-old-rebate').textContent = '-₹' + Math.round(result.oldRegime.rebate).toLocaleString('en-IN');
  document.getElementById('tax-old-cess').textContent = '₹' + Math.round(result.oldRegime.cess).toLocaleString('en-IN');

  // Update New Regime UI Panel
  document.getElementById('tax-new').textContent = '₹' + Math.round(result.newRegime.totalTax).toLocaleString('en-IN');
  document.getElementById('tax-new-gross').textContent = '₹' + Math.round(result.income).toLocaleString('en-IN');
  document.getElementById('tax-new-net').textContent = '₹' + Math.round(result.newRegime.netTaxableIncome).toLocaleString('en-IN');
  document.getElementById('tax-new-base').textContent = '₹' + Math.round(result.newRegime.taxBeforeCess).toLocaleString('en-IN');
  document.getElementById('tax-new-rebate').textContent = '-₹' + Math.round(result.newRegime.rebate).toLocaleString('en-IN');
  document.getElementById('tax-new-cess').textContent = '₹' + Math.round(result.newRegime.cess).toLocaleString('en-IN');

  // Highlight recommended card
  const oldCard = document.getElementById('card-regime-old');
  const newCard = document.getElementById('card-regime-new');
  const oldBadge = document.getElementById('badge-old');
  const newBadge = document.getElementById('badge-new');
  
  if (result.betterOption === 'Old Regime') {
    oldCard.classList.add('recommended');
    newCard.classList.remove('recommended');
    oldBadge.style.display = 'block';
    newBadge.style.display = 'none';
  } else {
    newCard.classList.add('recommended');
    oldCard.classList.remove('recommended');
    newBadge.style.display = 'block';
    oldBadge.style.display = 'none';
  }

  document.getElementById('itr-best-regime-label').textContent = result.betterOption;
}

function triggerItrOTPDispatch() {
  const email = document.getElementById('itr-email').value;
  if (!email.includes('@')) {
    alert('Please enter a valid tax filing signatory email.');
    return;
  }
  
  currentFilingContext = 'itr';

  // Send OTP
  const res = window.gstEngine.sendOTP(email);
  if (res.success) {
    openOtpModal();
  }
}

function showItrSuccessView(ack, date, details) {
  document.getElementById('itr-filing-wizard-form').style.display = 'none';
  document.getElementById('itr-filing-success-view').style.display = 'block';

  document.getElementById('itr-receipt-box').innerHTML = `
    <div class="receipt-row"><strong>NSDL Reference:</strong> <span>ITR Submitted</span></div>
    <div class="receipt-row"><strong>Acknowledgement:</strong> <span>${ack}</span></div>
    <div class="receipt-row"><strong>Filing Date:</strong> <span>${date}</span></div>
    <div class="receipt-row"><strong>Tax Assessment Yr:</strong> <span>AY 2027-28 (FY 26-27)</span></div>
    <div class="receipt-row"><strong>Filing Summary:</strong> <span>${details || 'Filing complete'}</span></div>
  `;
}

function resetItrView() {
  // Clear file match log to prompt file again
  const filings = window.taxDb.getFilings();
  const cleanFilings = filings.filter(f => !f.returnType.startsWith('ITR'));
  localStorage.setItem('tax_system_filings_' + window.taxDb.getProfile(), JSON.stringify(cleanFilings));
  
  document.getElementById('itr-filing-wizard-form').style.display = 'block';
  document.getElementById('itr-filing-success-view').style.display = 'none';
  initItrFilingHub();
}

// --- CATALOG MANAGEMENT ---

function renderCatalogTable() {
  const tbody = document.getElementById('catalog-table-tbody');
  tbody.innerHTML = '';
  const products = window.taxDb.getProducts();

  products.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${p.id}</strong></td>
        <td>${p.name}</td>
        <td>${p.hsn}</td>
        <td>₹${p.price.toLocaleString('en-IN')}</td>
        <td>GST ${p.gstRate}%</td>
        <td>${p.stock} units</td>
        <td>
          <button class="btn btn-sm" onclick="editCatalogItem('${p.id}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
        </td>
      </tr>
    `;
  });
}

function submitProductToCatalog() {
  const id = document.getElementById('prod-id').value.trim();
  const name = document.getElementById('prod-name').value.trim();
  const hsn = document.getElementById('prod-hsn').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  const gstRate = parseFloat(document.getElementById('prod-gst').value);
  const stock = parseInt(document.getElementById('prod-stock').value) || 0;

  if (!id || !name || !hsn || isNaN(price) || price <= 0) {
    alert('Please enter valid product inputs.');
    return;
  }

  const pObj = { id, name, hsn, price, gstRate, stock };
  window.taxDb.saveProduct(pObj);
  alert(`Item ${name} successfully logged in product catalog!`);

  // Clear inputs
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-hsn').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-stock').value = 50;

  renderCatalogTable();
}

function editCatalogItem(productId) {
  const p = window.taxDb.getProducts().find(item => item.id === productId);
  if (!p) return;

  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-hsn').value = p.hsn;
  document.getElementById('prod-price').value = p.price;
  document.getElementById('prod-gst').value = p.gstRate;
  document.getElementById('prod-stock').value = p.stock;
}

// --- OTP MODAL POPUP & E-SIGNATURES ---

function openOtpModal() {
  document.getElementById('otp-modal').classList.add('active');
  // Clear previous OTP characters
  for (let i = 1; i <= 6; i++) {
    document.getElementById(`otp-${i}`).value = '';
  }
  document.getElementById('otp-1').focus();
}

function closeOtpModal() {
  document.getElementById('otp-modal').classList.remove('active');
}

function moveOtpInput(current, nextFieldId) {
  if (current.value.length >= 1) {
    if (nextFieldId) {
      document.getElementById(nextFieldId).focus();
    } else {
      current.blur();
      confirmOtpSubmission();
    }
  }
}

async function confirmOtpSubmission() {
  // Collect 6 characters
  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById(`otp-${i}`).value;
  }

  if (code.length < 6) return;

  // Show processing in modal verify button
  const btn = document.getElementById('btn-modal-verify');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> Filing...`;
  btn.disabled = true;

  try {
    if (currentFilingContext === 'gst') {
      const results = window.gstEngine.getReconciliationData('2026-04-01', '2026-06-30');
      const filingRes = await window.gstEngine.submitFiling('GSTR-3B', 'Q1 (April - June 2026)', code);
      
      closeOtpModal();
      showGstSuccessView(filingRes.ackNumber, filingRes.date);
      alert('GSTR-3B return submitted successfully!');

    } else if (currentFilingContext === 'itr') {
      const pnl = window.itrEngine.computeProfitLoss();
      const profitVal = currentItrProfitMethod === 'standard' ? pnl.netProfitStandard : pnl.presumptiveProfit;
      
      // Calculate selected tax to save details
      const c80C = parseFloat(document.getElementById('ded-80c').value) || 0;
      const d80D = parseFloat(document.getElementById('ded-80d').value) || 0;
      const d24b = parseFloat(document.getElementById('ded-24b').value) || 0;
      const calcResult = window.itrEngine.calculateTax(profitVal, { sec80C: c80C, sec80D: d80D, sec24b: d24b });
      
      const chosenRegime = calcResult.betterOption;
      const taxPayableVal = chosenRegime === 'Old Regime' ? calcResult.oldRegime.totalTax : calcResult.newRegime.totalTax;
      
      const itrFormType = window.taxDb.getProfile() === 'retailer' && currentItrProfitMethod === 'presumptive' ? 'ITR-4 (Presumptive)' : 'ITR-3 (Business Accounts)';
      
      const filingRes = await window.itrEngine.submitITR(itrFormType, chosenRegime, profitVal, taxPayableVal, code);
      
      closeOtpModal();
      showItrSuccessView(filingRes.ackNumber, filingRes.date, `Regime: ${chosenRegime} | Form: ${itrFormType} | Declared Business Income: ₹${Math.round(profitVal).toLocaleString('en-IN')} | Net Tax Paid: ₹${Math.round(taxPayableVal).toLocaleString('en-IN')}`);
      alert('Income Tax Return (ITR) filed successfully!');
    }
  } catch (err) {
    alert(err.message);
    // Focus first element to try again
    document.getElementById('otp-1').focus();
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

// --- CUSTOMER PORTAL LOGIC ---

let currentCustomer = null;
let isCustomerInvoicePrintPending = false;
let customerPurchaseChart = null;

function openCustomerLoginModal() {
  document.getElementById('auth-gateway').classList.remove('fade-out');
  switchAuthRole('customer');
}

function closeCustomerLoginModal() {
  if (localStorage.getItem('taxhub_session')) {
    document.getElementById('auth-gateway').classList.add('fade-out');
  } else {
    alert('Authentication is required to access the portal.');
  }
}

function submitCustomerLogin() {
  // Deprecated - customer auth handled via OTP
}

function switchToCustomerPortal() {
  document.getElementById('business-nav').style.display = 'none';
  document.getElementById('customer-nav').style.display = 'flex';
  document.getElementById('business-profile-container').style.display = 'none';
  document.getElementById('customer-profile-container').style.display = 'block';
  document.getElementById('business-portal-toggle').style.display = 'none';

  document.getElementById('logged-in-customer-name').textContent = currentCustomer.name;
  document.getElementById('cust-info-name').textContent = currentCustomer.name;
  document.getElementById('cust-info-gstin').textContent = currentCustomer.gstin;
  document.getElementById('cust-info-state').textContent = currentCustomer.state;
  document.getElementById('cust-info-email').textContent = currentCustomer.email;

  triggerView('customer-dashboard');
}

function logoutCustomer() {
  addAuditLog('CUSTOMER', currentCustomer ? currentCustomer.email : 'Unknown', 'LOGOUT', 'User logged out of customer portal.');
  currentCustomer = null;
  localStorage.removeItem('taxhub_session');
  
  document.getElementById('business-nav').style.display = 'flex';
  document.getElementById('customer-nav').style.display = 'none';
  document.getElementById('business-profile-container').style.display = 'block';
  document.getElementById('customer-profile-container').style.display = 'none';
  document.getElementById('business-portal-toggle').style.display = 'block';

  showAuthGateway();
}

function initCustomerDashboard() {
  if (!currentCustomer) return;

  const allSales = window.taxDb.getSales();
  const custSales = allSales.filter(s => s.customer.gstin === currentCustomer.gstin);

  let totalPurchases = 0;
  let totalGstPaid = 0;
  let grossSpend = 0;

  custSales.forEach(s => {
    totalPurchases += s.summary.taxableAmount;
    totalGstPaid += s.summary.totalGst;
    grossSpend += s.summary.totalAmount;
  });

  document.getElementById('cust-kpi-purchases').textContent = '₹' + Math.round(totalPurchases).toLocaleString('en-IN');
  document.getElementById('cust-kpi-gst').textContent = '₹' + Math.round(totalGstPaid).toLocaleString('en-IN');
  document.getElementById('cust-kpi-total').textContent = '₹' + Math.round(grossSpend).toLocaleString('en-IN');
  document.getElementById('cust-kpi-invoice-count').textContent = custSales.length;

  renderCustomerPurchaseChart(custSales);
}

function renderCustomerPurchaseChart(invoices) {
  const monthNames = ['April 2026', 'May 2026', 'June 2026'];
  const purchaseData = [0, 0, 0];

  invoices.forEach(s => {
    const m = new Date(s.date).getMonth();
    if (m === 3) purchaseData[0] += s.summary.totalAmount;
    if (m === 4) purchaseData[1] += s.summary.totalAmount;
    if (m === 5) purchaseData[2] += s.summary.totalAmount;
  });

  if (customerPurchaseChart) {
    customerPurchaseChart.destroy();
  }

  const canvas = document.getElementById('customerPurchaseChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  customerPurchaseChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthNames,
      datasets: [
        {
          label: 'Total Spend (₹)',
          data: purchaseData,
          backgroundColor: '#000000',
          borderRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: '#e5e5e5'
          },
          ticks: {
            font: {
              family: 'Inter',
              size: 10
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              family: 'Inter',
              size: 10
            }
          }
        }
      }
    }
  });
}

function renderCustomerInvoicesTable() {
  if (!currentCustomer) return;

  const allSales = window.taxDb.getSales();
  const custSales = allSales.filter(s => s.customer.gstin === currentCustomer.gstin);
  const tbody = document.getElementById('cust-sales-tbody');
  tbody.innerHTML = '';

  if (custSales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No invoices received from the current business entity.</td></tr>';
    return;
  }

  const profile = window.taxDb.getProfile();
  const sellerName = profile === 'retailer' ? 'Antigravity Retail Outlet' : 'Antigravity Steel & Industrial Plant';

  custSales.forEach(sale => {
    const isPending = sale.eInvoiceStatus === 'Pending';
    const statusBadge = isPending 
      ? '<span class="badge badge-warning">Draft (Pending)</span>' 
      : `<span class="badge badge-success" title="IRN: ${sale.irn}">E-Way Verified</span>`;

    tbody.innerHTML += `
      <tr>
        <td><strong>${sale.id}</strong></td>
        <td>${sale.date}</td>
        <td>${sellerName}</td>
        <td>₹${sale.summary.taxableAmount.toLocaleString('en-IN')}</td>
        <td>GST ${sale.summary.totalGst > 0 ? ('₹' + sale.summary.totalGst.toLocaleString('en-IN')) : 'Exempt'}</td>
        <td><strong>₹${sale.summary.totalAmount.toLocaleString('en-IN')}</strong></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm" onclick="viewCustomerInvoice('${sale.id}')"><i class="fa-solid fa-eye"></i> View & Print</button>
        </td>
      </tr>
    `;
  });
}

function viewCustomerInvoice(invoiceId) {
  const sale = window.taxDb.getSales().find(s => s.id === invoiceId);
  if (!sale) return;

  const renderContainer = document.getElementById('customer-invoice-receipt-render');
  const profile = window.taxDb.getProfile();
  const sellerName = profile === 'retailer' ? 'Antigravity Retail & Tech' : 'Antigravity Industrial Solutions';
  const sellerGstin = '27ANTIG1234F1Z9';
  const sellerAddr = 'Vashi, Navi Mumbai, Maharashtra';
  const sellerEmail = 'accounts@antigravity.io';

  let itemsHtml = '';
  sale.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td style="text-align: left; padding: 12px 0;">${item.product.name}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: center;">₹${item.rate.toLocaleString('en-IN')}</td>
        <td style="text-align: center;">₹${(item.quantity * item.rate).toLocaleString('en-IN')}</td>
        <td style="text-align: center;">${item.product.gstRate}%</td>
        <td style="text-align: right; font-weight: 600;">₹${((item.quantity * item.rate) * (1 + item.product.gstRate / 100)).toLocaleString('en-IN')}</td>
      </tr>
    `;
  });

  const isIgst = sale.customer.state !== 'Maharashtra';
  const taxLabel = isIgst ? 'IGST:' : 'CGST + SGST:';
  
  let govPanelHtml = '';
  if (sale.eInvoiceStatus === 'Pushed') {
    const qrcodeSvg = window.billingEngine.generateMockQRCodeSVG(`INV:${sale.id}|IRN:${sale.irn.substring(0, 8)}`);
    govPanelHtml = `
      <div class="invoice-gov-panel" style="display: flex; gap: 20px; align-items: center; background-color: #fafafa; border: 1px solid #000; padding: 20px; margin-top: 30px;">
        <div class="invoice-gov-qr" style="width: 80px; height: 80px;">
          ${qrcodeSvg}
        </div>
        <div class="invoice-gov-details" style="font-size: 11px; line-height: 1.5;">
          <div style="font-weight: 700; color: #000; margin-bottom: 4px;">GOVERNMENT TAX PORTAL: E-INVOICE ACKNOWLEDGED</div>
          <div><strong>Ack No:</strong> 100226${Math.floor(1000000000 + Math.random() * 9000000000)}</div>
          <div><strong>Ack Date:</strong> ${sale.date} 10:14:22</div>
          <div><strong>IRN:</strong> <span class="invoice-gov-irn" style="font-family:var(--font-mono); font-size:10px; word-break: break-all; font-weight:700;">${sale.irn}</span></div>
        </div>
      </div>
    `;
  }

  renderContainer.innerHTML = `
    <div class="invoice-print" style="background: #fff; padding: 20px; font-family: var(--font-body);">
      <div class="invoice-header" style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
        <div>
          <h2 style="font-family: var(--font-display); font-size: 24px; font-weight: 700; margin: 0 0 6px;">${sellerName}</h2>
          <p style="margin: 0; font-size: 11px;">GSTIN: ${sellerGstin}</p>
          <p style="margin: 0; font-size: 11px;">${sellerAddr}</p>
        </div>
        <div style="text-align: right;">
          <h3 style="font-family: var(--font-display); font-size: 18px; margin: 0 0 6px; letter-spacing: 1px;">TAX INVOICE</h3>
          <p style="margin: 0; font-size: 11px;"><strong>Invoice ID:</strong> ${sale.id}</p>
          <p style="margin: 0; font-size: 11px;"><strong>Date:</strong> ${sale.date}</p>
        </div>
      </div>

      <div class="invoice-parties" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
        <div>
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Billed By</div>
          <div style="font-weight: 700; font-size: 13px;">${sellerName}</div>
          <p style="margin: 4px 0 0; font-size: 11px; color: var(--text-secondary);">${sellerEmail}</p>
        </div>
        <div>
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Billed To (Buyer)</div>
          <div style="font-weight: 700; font-size: 13px;">${sale.customer.name}</div>
          <p style="margin: 4px 0 0; font-size: 11px; color: var(--text-secondary);">GSTIN: ${sale.customer.gstin}</p>
          <p style="margin: 2px 0 0; font-size: 11px; color: var(--text-secondary);">Place of Supply: ${sale.customer.state}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="text-align: left; padding: 12px 0; font-size: 10px;">Product Description</th>
            <th style="text-align: center; font-size: 10px;">Qty</th>
            <th style="text-align: center; font-size: 10px;">Rate</th>
            <th style="text-align: center; font-size: 10px;">Taxable</th>
            <th style="text-align: center; font-size: 10px;">GST %</th>
            <th style="text-align: right; font-size: 10px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="invoice-totals" style="display: flex; justify-content: flex-end;">
        <table style="width: 250px; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid var(--border-subtle);">
            <td style="padding: 8px 0; font-size: 12px;">Taxable Subtotal:</td>
            <td style="text-align: right; padding: 8px 0; font-weight: 600; font-size: 12px;">₹${sale.summary.taxableAmount.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-subtle);">
            <td style="padding: 8px 0; font-size: 12px;">${taxLabel}</td>
            <td style="text-align: right; padding: 8px 0; font-weight: 600; font-size: 12px;">₹${sale.summary.totalGst.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-top: 1px solid #000; border-bottom: 2px double #000;">
            <td style="padding: 10px 0; font-size: 13px; font-weight: 700;">Grand Total:</td>
            <td style="text-align: right; padding: 10px 0; font-weight: 700; font-size: 14px;">₹${sale.summary.totalAmount.toLocaleString('en-IN')}</td>
          </tr>
        </table>
      </div>

      ${govPanelHtml}
    </div>
  `;

  document.getElementById('customer-invoice-modal').classList.add('active');
}

function closeCustomerInvoiceModal() {
  document.getElementById('customer-invoice-modal').classList.remove('active');
}

function printCustomerInvoice() {
  isCustomerInvoicePrintPending = true;
  window.print();
}

window.addEventListener('beforeprint', () => {
  if (isCustomerInvoicePrintPending) {
    document.body.classList.add('printing-customer-invoice');
  }
});

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-customer-invoice');
  isCustomerInvoicePrintPending = false;
});

// --- ADVANCED OTP AUTHENTICATION & SECURITY AUDITS ---

let authState = {
  currentRole: 'business', // 'business' or 'customer'
  pendingPhone: '',
  sentOtp: '',
  resendTimer: null,
  cooldownSeconds: 60,
  lockoutTimer: null,
  firebaseConfirmationResult: null,
  isLiveMode: false,
  policy: {
    maxAttempts: 3,
    sessionTimeout: 15 // minutes
  },
  idleTimer: null
};

// Seeding standard test credentials for offline simulator mode
const AUTH_PHONE_DIRECTORY = {
  business: {
    name: 'Shaik Azeem (Owner)',
    phone: '9876543210'
  },
  customer: [
    { name: 'Quantum Tech Solutions', phone: '9111111111', index: 0 },
    { name: 'Apex Retail Stores Inc.', phone: '9222222222', index: 1 },
    { name: 'Alpha Manufacturing Ltd', phone: '9333333333', index: 2 },
    { name: 'Individual Walk-in Client', phone: '9444444444', index: 3 }
  ]
};

function initAuthSystem() {
  // Load config keys & policies
  const fbConfig = localStorage.getItem('taxhub_fb_config');
  authState.isLiveMode = !!fbConfig;
  
  const savedPolicy = localStorage.getItem('taxhub_security_policy');
  if (savedPolicy) {
    authState.policy = JSON.parse(savedPolicy);
  }
  
  // Set policy values in Settings view UI
  document.getElementById('cfg-lockout-attempts').value = authState.policy.maxAttempts;
  document.getElementById('cfg-session-timeout').value = authState.policy.sessionTimeout;

  // Initialize view and display appropriate label
  updateSecurityPill();
  renderAuditLogs();

  // Populate Firebase inputs if they exist
  if (fbConfig) {
    const config = JSON.parse(fbConfig);
    document.getElementById('fb-api-key').value = config.apiKey || '';
    document.getElementById('fb-auth-domain').value = config.authDomain || '';
    document.getElementById('fb-project-id').value = config.projectId || '';
    document.getElementById('fb-storage-bucket').value = config.storageBucket || '';
    document.getElementById('fb-messaging-sender-id').value = config.messagingSenderId || '';
    document.getElementById('fb-app-id').value = config.appId || '';
  }

  // Inject Business Sign Out button dynamically in sidebar profile container
  const profileContainer = document.getElementById('business-profile-container');
  if (profileContainer && !document.getElementById('btn-business-logout')) {
    profileContainer.insertAdjacentHTML('beforeend', `
      <div style="margin-top: 15px; border-top: 1px dashed var(--border-subtle); padding-top: 15px;" id="btn-business-logout-wrap">
        <button class="btn btn-sm btn-danger w-full" id="btn-business-logout" onclick="logoutBusiness()"><i class="fa-solid fa-right-from-bracket"></i> Sign Out Portal</button>
      </div>
    `);
  }

  // Setup Firebase Auth if Live Mode
  if (authState.isLiveMode) {
    try {
      const config = JSON.parse(fbConfig);
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      
      // Initialize reCAPTCHA
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'normal',
        'callback': (response) => {
          // reCAPTCHA solved, enable send button
          document.getElementById('btn-send-otp').disabled = false;
        },
        'expired-callback': () => {
          alert('reCAPTCHA expired. Please solve it again.');
          document.getElementById('btn-send-otp').disabled = true;
        }
      });
      window.recaptchaVerifier.render();
    } catch (err) {
      console.error('Firebase Initialization Error:', err);
      addAuditLog('SYSTEM', 'N/A', 'FAILURE', `Firebase init error: ${err.message}`);
      authState.isLiveMode = false;
      updateSecurityPill();
    }
  }

  // Verify Active Session
  const activeSession = localStorage.getItem('taxhub_session');
  if (activeSession) {
    const session = JSON.parse(activeSession);
    
    // Check if session has expired
    const now = Date.now();
    const timeoutMs = authState.policy.sessionTimeout * 60 * 1000;
    if (authState.policy.sessionTimeout > 0 && (now - session.timestamp > timeoutMs)) {
      localStorage.removeItem('taxhub_session');
      addAuditLog(session.role.toUpperCase(), session.phone, 'EXPIRED', 'Session automatically timed out due to inactivity.');
      showAuthGateway();
    } else {
      // Restore Session
      if (session.role === 'customer') {
        currentCustomer = DEFAULT_CUSTOMERS[session.customerIndex];
        switchToCustomerPortal();
      } else {
        document.getElementById('auth-gateway').classList.add('fade-out');
        triggerView('dashboard');
      }
      resetIdleTimer();
      // Keep session timestamp updated
      session.timestamp = Date.now();
      localStorage.setItem('taxhub_session', JSON.stringify(session));
    }
  } else {
    showAuthGateway();
  }

  // Monitor user idle activity for session timeout
  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keypress', resetIdleTimer);
  document.addEventListener('click', resetIdleTimer);
}

function showAuthGateway() {
  document.getElementById('auth-gateway').classList.remove('fade-out');
  switchAuthRole('business');
  
  if (authState.isLiveMode && !window.recaptchaVerifier) {
    initAuthSystem();
  }
}

function updateSecurityPill() {
  const pill = document.getElementById('sec-integration-status');
  if (pill) {
    if (authState.isLiveMode) {
      pill.textContent = 'Live Firebase SMS Mode';
      pill.className = 'sec-status-pill live';
    } else {
      pill.textContent = 'Demo Simulator Mode';
      pill.className = 'sec-status-pill demo';
    }
  }
}

function switchAuthRole(role) {
  authState.currentRole = role;
  
  const tabBusiness = document.getElementById('tab-business');
  const tabCustomer = document.getElementById('tab-customer');
  
  if (role === 'business') {
    tabBusiness.classList.add('active');
    tabCustomer.classList.remove('active');
  } else {
    tabBusiness.classList.remove('active');
    tabCustomer.classList.add('active');
  }

  // Clear states
  document.getElementById('auth-phone-input').value = '';
  document.getElementById('phone-error-msg').style.display = 'none';
  
  // Show first step
  document.getElementById('auth-step-phone').classList.add('active');
  document.getElementById('auth-step-otp').classList.remove('active');
}

function logoutBusiness() {
  addAuditLog('BUSINESS', 'Owner', 'LOGOUT', 'User logged out of business management.');
  localStorage.removeItem('taxhub_session');
  showAuthGateway();
}

async function handleSendOtp() {
  const phoneInput = document.getElementById('auth-phone-input').value.trim();
  const errorMsg = document.getElementById('phone-error-msg');
  
  errorMsg.style.display = 'none';

  if (!/^\d{10}$/.test(phoneInput)) {
    showAuthError('phone-error-msg', 'Please enter a valid 10-digit mobile number.');
    return;
  }

  // Check lockout limits
  const lockoutTime = localStorage.getItem('taxhub_lockout_until');
  if (lockoutTime && Date.now() < parseInt(lockoutTime)) {
    const waitSec = Math.round((parseInt(lockoutTime) - Date.now()) / 1000);
    showAuthError('phone-error-msg', `System locked due to too many failed OTP attempts. Try again in ${waitSec}s.`);
    return;
  }

  const fullPhone = '+91' + phoneInput;
  authState.pendingPhone = phoneInput;
  
  const btn = document.getElementById('btn-send-otp');
  btn.disabled = true;
  btn.textContent = 'Sending OTP...';

  try {
    if (authState.isLiveMode) {
      // Firebase SMS Mode
      const appVerifier = window.recaptchaVerifier;
      const confirmationResult = await firebase.auth().signInWithPhoneNumber(fullPhone, appVerifier);
      authState.firebaseConfirmationResult = confirmationResult;
      
      addAuditLog(authState.currentRole.toUpperCase(), fullPhone, 'OTP_SENT', 'Live SMS OTP dispatched via Firebase Auth.');
    } else {
      // Simulator Mode
      const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
      authState.sentOtp = generatedOtp;
      console.log(`[TAXHUB SIMULATOR] Generated OTP code is: ${generatedOtp}`);
      
      showSmsSimulatorNotification(generatedOtp);
      addAuditLog(authState.currentRole.toUpperCase(), fullPhone, 'OTP_SENT', `Simulated SMS OTP sent (Code: ${generatedOtp})`);
    }

    // Go to step 2
    document.getElementById('display-auth-phone').textContent = fullPhone;
    document.getElementById('auth-step-phone').classList.remove('active');
    document.getElementById('auth-step-otp').classList.add('active');
    
    // Clear inputs in step 2
    for (let i = 1; i <= 6; i++) {
      document.getElementById(`auth-otp-${i}`).value = '';
    }
    document.getElementById('auth-otp-1').focus();

    startResendCooldown();

  } catch (err) {
    showAuthError('phone-error-msg', `Failed to send verification code: ${err.message}`);
    addAuditLog(authState.currentRole.toUpperCase(), fullPhone, 'OTP_FAIL', `Send OTP error: ${err.message}`);
    
    if (authState.isLiveMode && window.recaptchaVerifier) {
      window.recaptchaVerifier.render().then(widgetId => {
        grecaptcha.reset(widgetId);
      });
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Request verification code';
  }
}

function showSmsSimulatorNotification(code) {
  const container = document.getElementById('sms-simulator');
  document.getElementById('sms-sim-code').textContent = code;
  container.classList.add('active');
}

function hideSmsSimulatorNotification() {
  document.getElementById('sms-simulator').classList.remove('active');
}

function copySimOtp() {
  const code = document.getElementById('sms-sim-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    alert('Code copied to clipboard: ' + code);
  });
}

function autofillSimOtp() {
  const code = document.getElementById('sms-sim-code').textContent;
  for (let i = 1; i <= 6; i++) {
    const input = document.getElementById(`auth-otp-${i}`);
    if (input) {
      input.value = code[i - 1];
    }
  }
  document.getElementById('btn-verify-otp').disabled = false;
  handleVerifyOtp();
  hideSmsSimulatorNotification();
}

function moveAuthOtp(current, nextFieldId) {
  if (current.value.length >= 1) {
    if (nextFieldId) {
      document.getElementById(nextFieldId).focus();
    } else {
      current.blur();
      document.getElementById('btn-verify-otp').disabled = false;
      document.getElementById('btn-verify-otp').focus();
    }
  }
  
  let filled = true;
  for (let i = 1; i <= 6; i++) {
    if (!document.getElementById(`auth-otp-${i}`).value) {
      filled = false;
      break;
    }
  }
  document.getElementById('btn-verify-otp').disabled = !filled;
}

// Backspace support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' && e.target.classList.contains('auth-otp-digit')) {
    const idNum = parseInt(e.target.id.replace('auth-otp-', ''));
    if (idNum > 1 && !e.target.value) {
      const prevField = document.getElementById(`auth-otp-${idNum - 1}`);
      if (prevField) {
        prevField.focus();
        prevField.value = '';
        document.getElementById('btn-verify-otp').disabled = true;
      }
    }
  }
});

async function handleVerifyOtp() {
  const errorMsg = document.getElementById('otp-error-msg');
  errorMsg.style.display = 'none';

  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById(`auth-otp-${i}`).value;
  }

  if (code.length < 6) return;

  const btn = document.getElementById('btn-verify-otp');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    let verified = false;
    let authDetails = 'Verification successful';

    if (authState.isLiveMode) {
      const result = await authState.firebaseConfirmationResult.confirm(code);
      verified = !!result.user;
    } else {
      if (code === authState.sentOtp || code === '123456') {
        verified = true;
        authDetails = code === '123456' ? 'Simulated OTP verified via emergency bypass code.' : 'Simulated OTP verified successfully.';
      } else {
        verified = false;
      }
    }

    if (verified) {
      localStorage.removeItem('taxhub_failed_attempts');
      
      let customerIndex = -1;
      
      if (authState.currentRole === 'customer') {
        const match = AUTH_PHONE_DIRECTORY.customer.find(c => c.phone === authState.pendingPhone);
        if (match) {
          customerIndex = match.index;
        } else {
          customerIndex = parseInt(authState.pendingPhone) % DEFAULT_CUSTOMERS.length;
        }
        currentCustomer = DEFAULT_CUSTOMERS[customerIndex];
      }

      const session = {
        role: authState.currentRole,
        phone: authState.pendingPhone,
        timestamp: Date.now(),
        customerIndex: customerIndex
      };
      localStorage.setItem('taxhub_session', JSON.stringify(session));

      addAuditLog(authState.currentRole.toUpperCase(), authState.pendingPhone, 'SUCCESS', authDetails);
      hideSmsSimulatorNotification();

      const gateway = document.getElementById('auth-gateway');
      gateway.classList.add('fade-out');

      if (authState.currentRole === 'customer') {
        switchToCustomerPortal();
      } else {
        document.getElementById('business-nav').style.display = 'flex';
        document.getElementById('customer-nav').style.display = 'none';
        document.getElementById('business-profile-container').style.display = 'block';
        document.getElementById('customer-profile-container').style.display = 'none';
        document.getElementById('business-portal-toggle').style.display = 'block';
        triggerView('dashboard');
      }

      resetIdleTimer();

    } else {
      throw new Error('Invalid verification code. Please check and try again.');
    }

  } catch (err) {
    showAuthError('otp-error-msg', err.message);
    handleFailedOtpAttempt();
    
    const authCard = document.querySelector('.auth-container');
    if (authCard) {
      authCard.classList.add('shake-effect');
      setTimeout(() => {
        authCard.classList.remove('shake-effect');
      }, 500);
    }

    for (let i = 1; i <= 6; i++) {
      document.getElementById(`auth-otp-${i}`).value = '';
    }
    document.getElementById('auth-otp-1').focus();
    btn.disabled = true;
  } finally {
    btn.textContent = 'Confirm Access';
  }
}

function handleFailedOtpAttempt() {
  let failed = parseInt(localStorage.getItem('taxhub_failed_attempts') || '0');
  failed += 1;
  localStorage.setItem('taxhub_failed_attempts', failed);

  addAuditLog(authState.currentRole.toUpperCase(), authState.pendingPhone, 'FAILED_OTP', `Incorrect code entry. Attempt ${failed} of ${authState.policy.maxAttempts}.`);

  if (failed >= authState.policy.maxAttempts) {
    const lockoutDuration = 60 * 1000;
    const lockoutUntil = Date.now() + lockoutDuration;
    localStorage.setItem('taxhub_lockout_until', lockoutUntil);
    localStorage.removeItem('taxhub_failed_attempts');

    addAuditLog(authState.currentRole.toUpperCase(), authState.pendingPhone, 'LOCKED_OUT', `System locked out due to high OTP failure count.`);
    
    alert(`Too many incorrect OTP entries. Auth has been locked for 60 seconds.`);
    document.getElementById('auth-step-otp').classList.remove('active');
    document.getElementById('auth-step-phone').classList.add('active');
    document.getElementById('auth-phone-input').value = '';
  }
}

function startResendCooldown() {
  if (authState.resendTimer) clearInterval(authState.resendTimer);
  
  authState.cooldownSeconds = 60;
  const cooldownDisplay = document.getElementById('auth-cooldown');
  const resendBtn = document.getElementById('auth-resend-btn');
  const timerText = document.getElementById('auth-timer-text');
  
  cooldownDisplay.textContent = authState.cooldownSeconds;
  resendBtn.classList.add('disabled');
  timerText.style.display = 'inline';

  authState.resendTimer = setInterval(() => {
    authState.cooldownSeconds -= 1;
    cooldownDisplay.textContent = authState.cooldownSeconds;
    
    if (authState.cooldownSeconds <= 0) {
      clearInterval(authState.resendTimer);
      resendBtn.classList.remove('disabled');
      timerText.style.display = 'none';
    }
  }, 1000);
}

function showAuthError(elementId, message) {
  const errEl = document.getElementById(elementId);
  if (errEl) {
    errEl.textContent = message;
    errEl.style.display = 'block';
  }
}

function resetIdleTimer() {
  if (authState.idleTimer) clearTimeout(authState.idleTimer);
  
  const timeoutMin = authState.policy.sessionTimeout;
  if (timeoutMin <= 0) return;

  authState.idleTimer = setTimeout(() => {
    const session = localStorage.getItem('taxhub_session');
    if (session) {
      const parsed = JSON.parse(session);
      addAuditLog(parsed.role.toUpperCase(), parsed.phone, 'TIMEOUT', 'Session timed out due to inactivity.');
      if (parsed.role === 'customer') {
        logoutCustomer();
      } else {
        logoutBusiness();
      }
      alert('Your session has expired due to inactivity. Please log in again.');
    }
  }, timeoutMin * 60 * 1000);
}

function savePolicyConfigs() {
  const attempts = parseInt(document.getElementById('cfg-lockout-attempts').value);
  const timeout = parseInt(document.getElementById('cfg-session-timeout').value);
  
  authState.policy.maxAttempts = attempts;
  authState.policy.sessionTimeout = timeout;
  
  localStorage.setItem('taxhub_security_policy', JSON.stringify(authState.policy));
  addAuditLog('SYSTEM', 'Admin', 'POLICY_UPDATE', `Access policies updated. Max attempts: ${attempts}, Idle Timeout: ${timeout}m`);
  
  resetIdleTimer();
  alert('Security policies updated successfully.');
}

function saveFirebaseConfig() {
  const apiKey = document.getElementById('fb-api-key').value.trim();
  const authDomain = document.getElementById('fb-auth-domain').value.trim();
  const projectId = document.getElementById('fb-project-id').value.trim();
  const storageBucket = document.getElementById('fb-storage-bucket').value.trim();
  const messagingSenderId = document.getElementById('fb-messaging-sender-id').value.trim();
  const appId = document.getElementById('fb-app-id').value.trim();

  if (!apiKey || !projectId) {
    alert('Please enter valid Firebase configuration values (API Key & Project ID are required).');
    return;
  }

  const config = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
  localStorage.setItem('taxhub_fb_config', JSON.stringify(config));
  
  addAuditLog('SYSTEM', 'Admin', 'GATEWAY_CHANGE', 'Switched to Live Firebase SMS Gateway.');
  
  alert('Firebase configuration credentials saved. The system will initialize in Live SMS mode upon page reload.');
  window.location.reload();
}

function clearFirebaseConfig() {
  localStorage.removeItem('taxhub_fb_config');
  addAuditLog('SYSTEM', 'Admin', 'GATEWAY_CHANGE', 'Reset SMS Gateway to Simulator Mode.');
  alert('Firebase credentials removed. System returned to Simulator Mode.');
  window.location.reload();
}

function forceSystemLockout() {
  localStorage.removeItem('taxhub_session');
  addAuditLog('SYSTEM', 'Admin', 'FORCE_LOCK', 'Administrator terminated all active sessions.');
  alert('All active sessions terminated.');
  window.location.reload();
}

function addAuditLog(role, identifier, action, details) {
  let logs = JSON.parse(localStorage.getItem('taxhub_audit_logs') || '[]');
  
  const logEntry = {
    timestamp: new Date().toLocaleString(),
    role: role,
    identifier: identifier,
    action: action,
    ip: 'Fetching...',
    userAgent: navigator.userAgent
  };

  logs.unshift(logEntry);
  if (logs.length > 50) logs.pop();
  
  localStorage.setItem('taxhub_audit_logs', JSON.stringify(logs));
  renderAuditLogs();

  fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => {
      let currentLogs = JSON.parse(localStorage.getItem('taxhub_audit_logs') || '[]');
      const matchIndex = currentLogs.findIndex(l => l.timestamp === logEntry.timestamp && l.action === logEntry.action);
      if (matchIndex !== -1) {
        currentLogs[matchIndex].ip = data.ip;
        localStorage.setItem('taxhub_audit_logs', JSON.stringify(currentLogs));
        renderAuditLogs();
      }
    })
    .catch(() => {
      let currentLogs = JSON.parse(localStorage.getItem('taxhub_audit_logs') || '[]');
      const matchIndex = currentLogs.findIndex(l => l.timestamp === logEntry.timestamp && l.action === logEntry.action);
      if (matchIndex !== -1) {
        currentLogs[matchIndex].ip = '127.0.0.1 (Localhost)';
        localStorage.setItem('taxhub_audit_logs', JSON.stringify(currentLogs));
        renderAuditLogs();
      }
    });
}

function renderAuditLogs() {
  const tbody = document.getElementById('security-audit-tbody');
  if (!tbody) return;

  const logs = JSON.parse(localStorage.getItem('taxhub_audit_logs') || '[]');
  tbody.innerHTML = '';
  
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 24px 0;">No login logs or security transactions recorded.</td></tr>`;
    return;
  }

  logs.forEach(log => {
    let actionBadge = '';
    if (log.action === 'SUCCESS') {
      actionBadge = `<span class="badge badge-success" style="background-color:#34c759; color:#fff;">SUCCESS</span>`;
    } else if (log.action === 'OTP_SENT') {
      actionBadge = `<span class="badge badge-warning" style="background-color:#ff9500; color:#fff; border:none;">OTP SENT</span>`;
    } else if (log.action.includes('FAIL') || log.action === 'LOCKED_OUT') {
      actionBadge = `<span class="badge badge-danger" style="background-color:#ff3b30; color:#fff; border:none;">${log.action}</span>`;
    } else {
      actionBadge = `<span class="badge badge-info" style="background-color:#5856d6; color:#fff; border:none;">${log.action}</span>`;
    }

    let uaSummary = 'Unknown Device';
    if (log.userAgent) {
      if (log.userAgent.includes('Windows')) {
        uaSummary = 'Windows | ';
      } else if (log.userAgent.includes('Macintosh')) {
        uaSummary = 'macOS | ';
      } else if (log.userAgent.includes('iPhone') || log.userAgent.includes('iPad')) {
        uaSummary = 'iOS | ';
      } else if (log.userAgent.includes('Android')) {
        uaSummary = 'Android | ';
      } else {
        uaSummary = 'Linux | ';
      }

      if (log.userAgent.includes('Chrome')) {
        uaSummary += 'Chrome';
      } else if (log.userAgent.includes('Firefox')) {
        uaSummary += 'Firefox';
      } else if (log.userAgent.includes('Safari')) {
        uaSummary += 'Safari';
      } else {
        uaSummary += 'Edge/Other';
      }
    }

    tbody.innerHTML += `
      <tr>
        <td style="font-family: var(--font-mono); font-size:11px;">${log.timestamp}</td>
        <td style="font-weight: 600;">${log.role}</td>
        <td>${log.identifier}</td>
        <td>${actionBadge}</td>
        <td style="font-family: var(--font-mono); font-size:11px;">${log.ip}</td>
        <td style="font-size:11px; color: var(--text-secondary);">${uaSummary}</td>
      </tr>
    `;
  });
}

function clearAuditLogs() {
  if (confirm('Are you sure you want to permanently erase the security audit records?')) {
    localStorage.removeItem('taxhub_audit_logs');
    addAuditLog('SYSTEM', 'Admin', 'LOGS_CLEARED', 'Security audit records erased by administrator.');
    alert('Logs cleared successfully.');
  }
}
