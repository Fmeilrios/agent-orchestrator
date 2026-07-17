//go:build windows

package codex

import (
	"context"
	"testing"

	"golang.org/x/sys/windows"
)

func TestAuthStatusCommandContextHidesWindow(t *testing.T) {
	cmd := authStatusCommandContext(context.Background(), "codex", "login", "status")
	if cmd.SysProcAttr == nil {
		t.Fatal("SysProcAttr = nil, want hidden Windows process attributes")
	}
	if got := cmd.SysProcAttr.CreationFlags; got&windows.CREATE_NO_WINDOW == 0 {
		t.Fatalf("CreationFlags = %#x, want CREATE_NO_WINDOW", got)
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Fatal("HideWindow = false, want true")
	}
}
