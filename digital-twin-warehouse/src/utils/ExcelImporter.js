import Papa from 'papaparse';
import * as XLSX from 'xlsx'; // Need to install this if reading .xlsx specifically, but Papa is usually CSV. 
// Ah, user said "Excel". I should use sheetjs (xlsx) for robust excel support. 
// But PapaParse is good for CSV. I'll stick to XLSX if available or use a library that handles both?
// Plan said "Imports Orders from Excel". 

export const parseExcelOrders = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Transform to our order format
                // Expected format matches carto_MAMED.xlsx or generic order file?
                // For now, assume simple list: { OrderID, ProductZone, Quantity }

                const orders = jsonData.map((row, index) => ({
                    id: row.OrderID || `ORD-${index}`,
                    zoneId: row.Zone || row.Format || 'zone_A', // Fallback
                    items: []
                }));

                resolve(orders);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};
