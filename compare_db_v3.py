import sys
import os
import firebird.driver
from firebird.driver import driver_config

# Constants
FB_CLIENT_LIB = r'D:\Projects\image-scoring\Firebird\fbclient.dll'
RESTORED_DSN = r'127.0.0.1:D:\Projects\image-scoring\SCORING_HISTORY.FDB'
CORRUPTED_DSN = r'D:\Projects\image-scoring\SCORING_HISTORY.FDB.corrupted'

driver_config.fb_client_library.value = FB_CLIENT_LIB

def get_db_stats(dsn):
    try:
        conn = firebird.driver.connect(dsn, user='sysdba', password='masterkey', charset='UTF8')
        c = conn.cursor()
        
        # 1. Total images
        c.execute("SELECT COUNT(*) FROM IMAGES")
        img_count = c.fetchone()[0]
        
        # 2. Max and Min image ID
        c.execute("SELECT MAX(ID), MIN(ID) FROM IMAGES")
        max_id, min_id = c.fetchone()
        
        # 3. Last created image
        c.execute("SELECT MAX(CREATED_AT) FROM IMAGES")
        last_create = c.fetchone()[0]
        
        # 4. Folders count
        c.execute("SELECT COUNT(*) FROM FOLDERS")
        folder_count = c.fetchone()[0]
        
        # 5. Exif/XMP counts
        c.execute("SELECT COUNT(IMAGE_ID) FROM IMAGE_EXIF")
        exif_count = c.fetchone()[0]
        c.execute("SELECT COUNT(IMAGE_ID) FROM IMAGE_XMP")
        xmp_count = c.fetchone()[0]
        
        # 6. Check if some specific recent data exists
        c.execute("SELECT FIRST 5 ID, FILE_NAME FROM IMAGES ORDER BY ID DESC")
        latest_images = c.fetchall()
        
        conn.close()
        return {
            "count": img_count,
            "max_id": max_id,
            "min_id": min_id,
            "last_create": last_create,
            "folders": folder_count,
            "exif_count": exif_count,
            "xmp_count": xmp_count,
            "latest": latest_images
        }
    except Exception as e:
        return f"Error: {str(e)}"

log_file = r'd:\Projects\image-scoring-gallery\compare_report.txt'
with open(log_file, 'w', encoding='utf-8') as f:
    def log(msg):
        print(msg)
        f.write(msg + '\n')

    log("--- Firebird Comparison Report ---")
    
    restored_stats = get_db_stats(RESTORED_DSN)
    corrupted_stats = get_db_stats(CORRUPTED_DSN)
    log(f"Restored Stats: {restored_stats if isinstance(restored_stats, str) else 'OK'}")
    log(f"Corrupted Stats: {corrupted_stats if isinstance(corrupted_stats, str) else 'OK'}")

    if not isinstance(restored_stats, str) and not isinstance(corrupted_stats, str):
        log("\n[COUNTS]")
        log(f"{'Metric':20} | {'Restored':20} | {'Corrupted':20} | {'Gain/Loss':10}")
        log("-" * 75)
        log(f"{'Image Count':20} | {restored_stats['count']:>10} | {corrupted_stats['count']:>10} | {corrupted_stats['count'] - restored_stats['count']:>+10d}")
        log(f"{'Exif Count':20} | {restored_stats['exif_count']:>10} | {corrupted_stats['exif_count']:>10} | {corrupted_stats['exif_count'] - restored_stats['exif_count']:>+10d}")
        log(f"{'XMP Count':20} | {restored_stats['xmp_count']:>10} | {corrupted_stats['xmp_count']:>10} | {corrupted_stats['xmp_count'] - restored_stats['xmp_count']:>+10d}")
        log(f"{'Min Image ID':20} | {restored_stats['min_id']:>10} | {corrupted_stats['min_id']:>10} | {'---'}")
        log(f"{'Max Image ID':20} | {restored_stats['max_id']:>10} | {corrupted_stats['max_id']:>10} | {restored_stats['max_id'] - restored_stats['max_id']:>+10d}")
        log(f"{'Folder Count':20} | {restored_stats['folders']:>10} | {corrupted_stats['folders']:>10} | {corrupted_stats['folders'] - restored_stats['folders']:>+10d}")
        log(f"{'Last Create':20} | {str(restored_stats['last_create']):20} | {str(corrupted_stats['last_create']):20} | {'---'}")
        
        # Check for IDs in corrupted but not in restored
        log("\n[SAMPLING LATEST RECORDS IN CORRUPTED]")
        for rid, name in corrupted_stats['latest']:
            log(f"  ID {rid}: {name}")
    else:
        log("\nCOULD NOT COMPARE - See errors above.")
