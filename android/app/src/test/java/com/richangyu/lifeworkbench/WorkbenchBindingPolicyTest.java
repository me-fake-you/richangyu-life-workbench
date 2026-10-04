package com.richangyu.lifeworkbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class WorkbenchBindingPolicyTest {
    @Test public void emptyInputDoesNotCreateAnOrigin() {
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin(null));
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin(""));
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin(" \r\n\t "));
    }

    @Test public void oneHttpsRootCanBeTrimmedAndNormalized() {
        assertEquals("https://demo.example.com",
            WorkbenchBindingPolicy.preparedOrigin(" \nHTTPS://DEMO.EXAMPLE.COM:443/\t "));
    }

    @Test public void unsafeOrNonRootAddressesAreRejected() {
        for (String value : new String[] {"http://demo.example.com", "demo.example.com",
                "https://127.0.0.1", "https://localhost", "https://demo.local",
                "https://demo.example.com:8443", "https://name:pass@demo.example.com",
                "https://demo.example.com/login", "https://demo.example.com?token=placeholder",
                "https://demo.example.com#fragment"})
            assertEquals(value, "", WorkbenchBindingPolicy.preparedOrigin(value));
    }

    @Test public void multipleLinesAndHiddenControlsCannotChangeTheDestination() {
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin("https://demo.example.com\nhttps://other.example.com"));
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin("https://demo.\texample.com"));
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin("https://demo.example.com" + (char) 0));
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin("https://demo.example.com" + (char) 127));
    }

    @Test public void overlongInputIsRejectedBeforeNormalization() {
        StringBuilder value = new StringBuilder("https://demo.example.com");
        while (value.length() < WorkbenchBindingPolicy.MAX_ADDRESS) value.append(' ');
        assertEquals("https://demo.example.com", WorkbenchBindingPolicy.preparedOrigin(value.toString()));
        value.append(' ');
        assertEquals("", WorkbenchBindingPolicy.preparedOrigin(value.toString()));
    }

    @Test public void unconfiguredOrInvalidInputIsNotReportedAsConnecting() {
        assertEquals(WorkbenchBindingPolicy.EntryState.NEEDS_BINDING, WorkbenchBindingPolicy.entryState(null));
        assertEquals(WorkbenchBindingPolicy.EntryState.NEEDS_BINDING, WorkbenchBindingPolicy.entryState(""));
        assertEquals(WorkbenchBindingPolicy.EntryState.NEEDS_BINDING, WorkbenchBindingPolicy.entryState("http://demo.example.com"));
        assertEquals(WorkbenchBindingPolicy.EntryState.WAITING_AUTH,
            WorkbenchBindingPolicy.entryState("https://demo.example.com"));
    }
}
