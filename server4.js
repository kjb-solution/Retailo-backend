const express = require("express");
const fs = require("fs");
const path = require("path");
const printer = require("pdf-to-printer");
const cors = require("cors");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Create Invoice HTML Template
function generateInvoiceHTML(data) {
  const {
    billNumber,
    date,
    time,
    tableNo,
    captain,
    items,
    subtotal,
    sgst,
    cgst,
    vat,
    total,
  } = data;

  const itemsHtml = items.map((item, index) => `
    <tr>
      <td class="left table-data" style="padding-left: 3">${index + 1}</td>
      <td class="table-data">${item.name}</td>
      <td class="center table-data">${item.quantity}</td>
      <td class="right table-data">${item.price.toFixed(2)}</td>
      <td class="right table-data">${(item.quantity * item.price).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
  <html>
    <head>
      <style>
        body {
          font-family: Poppins, sans-serif;
          font-size: 10px;
          margin: 0;
          padding: 3px;
        }
        .center {
          text-align: center;
        }
        .left {
          text-align: left;
        }
        .right {
          text-align: right;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 5px;
        }
        thead {
          border-top: 1px solid black;
          border-bottom: 1px solid black;
          padding: 0px 2px;
          background-color:rgb(238, 237, 237);
        }
        th, td {
          padding: 2px 2px;
          vertical-align: top;
          font-size: 11px;
        }
        .summary-table {
          border-top: 1px solid black;
          margin-top: 5px;
        }
        .summary-table td {
          padding: 1px 0;
        }
        .dashed-line {
          border-top: 1px dashed black;
          margin: 5px 0;
        }
        .grand-total {
          font-weight: bold;
          font-size: 20px;
          text-align: center;
          margin-top: 5px;
        }
        .small-text {
          font-size: 10px;
        }
        .company_name {
          font-size: 16px;
          font-weight: bolder;
        }
        .headerInfo {
          margin-top: 5px;
          display: flex;
          justify-content: space-between;
        }
        .header-text {
          margin-top: 5px;
        }
        .address {
          font-size: 12px;
          padding: 0;
          margin: 0;
        }
        .bill-header {
          font-size: 14px;
        }
        .table-head {
          font-size: 13px;
        }
        .table-data {
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="center">
        <div class="company_name"><strong>GREEN GARDEN RESORT</strong></div>
        <p class="address">2/327C, Shenbagadevi St, Old Courtallam</p>
        <p class="address">Ayiraperi Post, Tenkasi Dist.</p>
        <p class="address">www.greengardenresort.in</p>
        <p class="address">Ph:+91 9487479999, 9487489999</p>
        <p class="address">GST.No: 33BTBPS1733B1Z7</p>
        <div style="margin: 5px 0; font-size: 12px;" ><strong>Bar-Bill</strong></div>
      </div>

      <div class="headerInfo">
        <div>
          <div class="header-text bill-header" style="font-weight: bold;">Bill No : ${billNumber}</div>
          <div class="header-text">Date : ${date}</div>
          <div class="header-text">Captain : ${captain}</div>
        </div>
        <div>
          <div class="header-text">Time : ${time}</div>
          <div class="header-text">Table No: ${tableNo}</div>
        </div>
      </div>

      <table style="margin-top: 8px">
        <thead>
          <tr>
            <th class="center table-head">SNo</th>
            <th class="left table-head">Item Name</th>
            <th class="center table-head">Qty</th>
            <th class="center table-head">Rate</th>
            <th class="center table-head">Tot</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <table class="summary-table">
        <tr>
          <td class="left">Net Qty :</td>
          <td class="right">${items.reduce((acc, item) => acc + item.quantity, 0)}</td>
        </tr>
        <tr>
          <td class="left">Net Tot :</td>
          <td class="right">${subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="left">S GST (2.50%) :</td>
          <td class="right">${sgst}</td>
        </tr>
        <tr>
          <td class="left">C GST (2.50%) :</td>
          <td class="right">${cgst}</td>
        </tr>
        <tr>
          <td class="left">VAT (14.50%) :</td>
          <td class="right">${vat.toFixed(2)}</td>
        </tr>
      </table>

      <div class="dashed-line"></div>

      <div class="grand-total">GRAND TOTAL: ₹ ${total.toFixed(2)}</div>
    </body>
  </html>
  `;
}

// Route to create invoice PDF and print
app.post("/print-receipt", async (req, res) => {
    const pdfPath = path.join(__dirname, "receipt.pdf");
  
    try {
      console.time("PrintTimer"); // Start the timer
  
      const invoiceHTML = generateInvoiceHTML(req.body);

      const browser = await puppeteer.launch({
        headless: true,  // Ensure it's running headless
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      
  
      const page = await browser.newPage();
      await page.setContent(invoiceHTML, { waitUntil: "domcontentloaded" });

  
      // Set custom Roll Paper size: 80mm x 297mm
      await page.pdf({
        path: pdfPath,
        width: "80mm",
        height: "297mm",
        printBackground: true,
        margin: {
          top: "5mm",
          bottom: "5mm",
          left: "5mm",
          right: "5mm",
        },
      });
  
      await browser.close();
  
      console.log("✅ PDF generated, sending to printer...");
  
      const printOptions = {
        printer: "EPSON TM-T82 Receipt", // Replace with your printer name
      };
  
      // printing the receipt
      await printer.print(pdfPath, printOptions);
      fs.unlinkSync(pdfPath); // Clean up the file after printing
  
      console.timeEnd("PrintTimer"); // End the timer and log the time taken
  
      res.json({ success: true, message: "Receipt printed successfully!" });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({
          success: false,
          message: "Error printing receipt",
          error: err.message,
        });
    }
  });
  

app.listen(PORT, () => {
  console.log(`🖨️ Server running at http://localhost:${PORT}`);
});
