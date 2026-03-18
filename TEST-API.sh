#!/bin/bash
echo ""
echo "================================================"
echo "   CSV Import API Test"
echo "================================================"
echo ""
echo "Teste ob die API funktioniert..."
echo ""

curl -X POST http://localhost:5000/api/contacts/import/csv -F "file=@TEST-IMPORT.csv"

echo ""
echo ""
echo "Öffne auch: http://localhost:5000/api/version"
echo ""
echo "Dort sollte stehen:"
echo '{ "version": "2.1.0", "csv_module": true, "imports_ok": true }'
echo ""
