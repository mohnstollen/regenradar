package de.regenradar.wetter;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Stellt geteilte Kartenbilder (Cache-Ordner „share“) für andere Apps bereit – schlanker Ersatz für den FileProvider
 * aus androidx. Nur lesend und nur mit erteilter URI-Berechtigung (exported=false, grantUriPermissions=true).
 */
public class ShareProvider extends ContentProvider {
    static final String AUTHORITY = "de.regenradar.wetter.share";

    static File dir(android.content.Context c) { return new File(c.getCacheDir(), "share"); }

    private File file(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.startsWith(".")) throw new FileNotFoundException(String.valueOf(uri));
        File f = new File(dir(getContext()), name);
        if (!f.isFile()) throw new FileNotFoundException(String.valueOf(uri));
        return f;
    }

    @Override
    public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) { return "image/png"; }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try { f = file(uri); } catch (FileNotFoundException e) { return null; }
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        c.addRow(new Object[] { f.getName(), f.length() });
        return c;
    }

    @Override
    public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }

    @Override
    public int delete(Uri uri, String s, String[] a) { throw new UnsupportedOperationException(); }

    @Override
    public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
