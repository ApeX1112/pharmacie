import pandas as pd
import json

try:
    df = pd.read_excel('carto_MAMED.xlsx', engine='openpyxl')
    with open('carto_analysis.txt', 'w') as f:
        f.write(f"Columns: {df.columns.tolist()}\n")
        f.write("First 5 rows:\n")
        f.write(df.head().to_json(orient='records', indent=2))
        f.write("\n")
        
        coord_cols = [c for c in df.columns if isinstance(c, str) and ('x' in c.lower() or 'y' in c.lower() or 'coord' in c.lower())]
        f.write(f"Potential coordinate columns: {coord_cols}\n")

    
except Exception as e:
    print(f"Error reading excel: {e}")
