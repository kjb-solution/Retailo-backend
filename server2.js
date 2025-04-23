const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const printer = require("pdf-to-printer");
const si = require("systeminformation");
const cors = require("cors");
const bodyParser = require("body-parser");
const { log } = require("console");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Route to get default printer
app.get("/get-default-printer", async (req, res) => {
  try {
    const defaultPrinter = await printer.getDefaultPrinter();
    if (!defaultPrinter) {
      return res.status(404).json({
        success: false,
        message: "Default printer not found",
      });
    }
    res.json({ success: true, defaultPrinter });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch default printer",
      error: err.message,
    });
  }
});

// Route to get all printers and their status
app.get("/get-all-printers", async (req, res) => {
  try {
    const printers = await printer.getPrinters(); // Get all printers
    res.json({ success: true, printers: printers });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch printers",
      error: err.message,
    });
  }
});

//  Route to Checks if a printer is connected and available
async function checkPrinterConnection(printerName) {
  try {
    const allPrinters = await si.printer();
    const targetPrinter = allPrinters.find(
      (printer) => printer.name === printerName
    );
    if (!targetPrinter) {
      return {
        connected: false,
        status: "Printer not found",
        message: `Printer '${printerName}' not found`,
      };
    }

    // Status-based detection (works for most printers)
    const isConnected = [
      "Idle", // Common ready state
      "Printing", // Actively working
      "Ready", // Alternative ready state
    ].includes(targetPrinter.status);

    return {
      connected: isConnected,
      status: targetPrinter.status,
      details: targetPrinter,
      message: isConnected
        ? `Printer '${printerName}' is connected`
        : `Printer '${printerName}' is offline (Status: ${targetPrinter.status})`,
    };
  } catch (error) {
    return {
      connected: false,
      status: "Error",
      error: error.message,
      message: `Failed to check printer status: ${error.message}`,
    };
  }
}
app.post("/check-printer-status", async (req, res) => {
  const { printerName } = req.body;
  console.log("Received printerName:", printerName);

  if (!printerName) {
    return res.status(400).json({
      error: "Missing printerName in request body",
    });
  }

  const result = await checkPrinterConnection(printerName);
  res.json(result);
});

// Route to print receipt
app.post("/print-receipt", async (req, res) => {
  const filePath = path.join(__dirname, "receipt.pdf");

  try {
    const {
      items,
      subtotal,
      tax,
      total,
      selectedPayment,
      gstNumber,
      date,
      billNumber,
      companyName,
      cgst,
      sgst,
    } = req.body;
  

    // Estimate height dynamically
    const estimatedHeight = 100 + items.length * 20 + 150;

    const doc = new PDFDocument({
      size: [80, estimatedHeight], // 80mm width, dynamic height
      margins: { top: 0, bottom: 0, left: 10, right: 10 },
    });
    console.log(`PDF Dimensions: 226.77x${estimatedHeight}mm`);
    console.log(`Items count: ${items.length}`);

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Font settings
    const regularFont = "Helvetica";
    const boldFont = "Helvetica-Bold";

    // Company Header
    doc
      .font(boldFont)
      .fontSize(14)
      .text(companyName || "KJB SOLUTION", { align: "center", y: -28 });
    doc.moveDown(0.5);

    // Column headers with proper spacing
    doc.font(boldFont).fontSize(10);
    doc.text("ITEM            QTY   RATE   AMOUNT", { align: "left" });
    doc.moveDown(0.2);
    doc.text("----------------------------------", { align: "left" });

    // Items list with fixed-width columns
    doc.font(regularFont).fontSize(10);
    items.forEach((item) => {
      const itemName =
        item.name.length > 12
          ? item.name.substring(0, 9) + "..."
          : item.name.padEnd(12);
      const line = [
        itemName.padEnd(16),
        item.quantity.toString().padStart(3),
        `₹${item.price.toFixed(2)}`.padStart(7),
        `₹${(item.quantity * item.price).toFixed(2)}`.padStart(8),
      ].join("  ");

      doc.text(line, { align: "left" });
    });

    doc.moveDown(0.5);
    doc.text("----------------------------------", { align: "left" });
    doc.moveDown(0.5);

    // Totals section with proper alignment
    doc
      .font(boldFont)
      .text(`Subtotal`, { continued: true, align: "left" })
      .text(`₹${subtotal.toFixed(2)}`, { align: "right" });

    doc
      .font(regularFont)
      .text(`CGST`, { continued: true, align: "left" })
      .text(`₹${cgst || "0.00"}`, { align: "right" });

    doc
      .text(`SGST`, { continued: true, align: "left" })
      .text(`₹${sgst || "0.00"}`, { align: "right" });

    doc.moveDown(0.5);
    doc
      .font(boldFont)
      .text(`Total`, { continued: true, align: "left" })
      .text(`₹${total.toFixed(2)}`, { align: "right" });
    doc.moveDown(0.5);

    // Payment method
    doc
      .font(regularFont)
      .text(`Paid via ${selectedPayment || "Cash"}`, { align: "center" });
    doc.moveDown(1);

    // Footer
    doc.text("Make sure to come Again", { align: "center" });

    doc.end();

    writeStream.on("finish", async () => {
      try {
        const printOptions = {
          printer: "EPSON TM-T82 Receipt",
          paperSize: "80mm x 297mm", // Standard roll paper size
          marginTop: 0,  // Explicitly set top margin to 0
          scale: "noscale", // Prevent scaling
          tearOff: false, // Disable automatic tear-off space
          offsetTop: -3   // Try negative offset (may vary by printer)
        };
        console.log("Sending to printer:", filePath);
        const newPrint = await printer.print(filePath, { printOptions });
        console.log("Print result:", newPrint);
        
        // fs.unlink(filePath, () => {});
        res.json({ success: true, message: "Receipt printed successfully!" });
      } catch (err) {
        fs.unlink(filePath, () => {});
        res.status(500).json({
          success: false,
          message: "Failed to print",
          error: err.message,
        });
      }
    });

    writeStream.on("error", (writeErr) => {
      res.status(500).json({
        success: false,
        message: "Failed to generate PDF",
        error: writeErr.message,
      });
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Unexpected error",
      error: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🖨️ Server running at http://localhost:${PORT}`);
});
