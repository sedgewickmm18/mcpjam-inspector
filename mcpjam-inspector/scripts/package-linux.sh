#!/bin/bash

set -e

# MCPJam Inspector Linux Packaging Script
# This script handles the complete Linux desktop app packaging process

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 22+ first."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed."
        exit 1
    fi
    
    # Check for required Linux packaging tools (optional but recommended)
    if command -v dpkg &> /dev/null; then
        log_success "dpkg found (for .deb packages)"
    else
        log_warn "dpkg not found - .deb packages may not build. Install with: sudo apt install dpkg fakeroot"
    fi
    
    if command -v rpmbuild &> /dev/null; then
        log_success "rpmbuild found (for .rpm packages)"
    else
        log_warn "rpmbuild not found - .rpm packages may not build. Install with: sudo dnf install rpm-build (Fedora/RHEL) or sudo apt install rpm (Debian/Ubuntu)"
    fi
    
    log_success "Prerequisites check complete"
}

# Generate Linux icon
generate_icon() {
    log_info "Generating Linux icon..."
    
    if [ ! -f "$PROJECT_ROOT/assets/icon.png" ]; then
        if ! command -v node &> /dev/null; then
            log_error "Node.js required for icon generation"
            exit 1
        fi
        
        # Run the icon generation script
        node "$SCRIPT_DIR/generate-linux-icon.mjs"
        
        if [ ! -f "$PROJECT_ROOT/assets/icon.png" ]; then
            log_error "Failed to generate icon.png"
            exit 1
        fi
    else
        log_info "icon.png already exists, skipping generation"
    fi
    
    log_success "Icon ready"
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."
    
    # Clear Vite cache and node_modules for clean install
    log_info "Cleaning previous builds..."
    rm -rf node_modules/.vite
    rm -rf client/node_modules/.vite
    rm -rf node_modules
    rm -rf client/node_modules
    
    # Build SDK dependency first (required for client build)
    log_info "Building SDK dependency..."
    cd "$PROJECT_ROOT/../sdk"
    rm -rf node_modules
    npm ci
    npm run build
    cd "$PROJECT_ROOT"
    
    # Root dependencies
    npm ci --legacy-peer-deps
    
    log_success "Dependencies installed"
}

# Build the project
build() {
    log_info "Building project..."
    
    # Build the client
    npm run build:client
    
    # Build the library
    npm run build:lib
    
    log_success "Build complete"
}

# Package for Linux
package_linux() {
    log_info "Packaging for Linux..."
    
    # NOTE: .rpm and .deb packages have issues with scoped package names (@mcpjam/inspector)
    # The ZIP package works reliably and can be installed on any Linux distribution
    # 
    # If you need .rpm/.deb support, the package name would need to be changed from
    # @mcpjam/inspector to a non-scoped name like mcpjam-inspector
    
    TARGETS="zip"  # Build only zip (works reliably)
    
    log_info "Building for: $TARGETS (portable archive)"
    log_warn "Note: .rpm and .deb packages have known issues with scoped package names"
    echo ""
    
    # Run Electron Forge make command with detected targets
    # We call electron-forge directly to avoid building for all platforms
    npx electron-forge make --platform=linux --targets=$TARGETS
    
    log_success "Packaging complete"
}

# Show output locations
show_output() {
    log_info "========================================"
    log_info "PACKAGING COMPLETE!"
    log_info "========================================"
    echo ""
    
    # Find and display output files
    OUT_DIR="$PROJECT_ROOT/out"
    
    if [ -d "$OUT_DIR" ]; then
        log_info "Output files:"
        echo ""
        
        # List .deb files
        if ls "$OUT_DIR"/*.deb 1> /dev/null 2>&1; then
            log_success "Debian/Ubuntu packages (.deb):"
            ls -lh "$OUT_DIR"/*.deb 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
            echo ""
        fi
        
        # List .rpm files
        if ls "$OUT_DIR"/*.rpm 1> /dev/null 2>&1; then
            log_success "Fedora/RHEL packages (.rpm):"
            ls -lh "$OUT_DIR"/*.rpm 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
            echo ""
        fi
        
        # List .zip files
        if ls "$OUT_DIR"/*.zip 1> /dev/null 2>&1; then
            log_success "Archive files (.zip):"
            ls -lh "$OUT_DIR"/*.zip 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
            echo ""
        fi
    else
        log_warn "No output directory found at $OUT_DIR"
    fi
    
    echo ""
    log_info "To install:"
    echo "  .deb: sudo dpkg -i out/<package>.deb"
    echo "  .rpm: sudo rpm -i out/<package>.rpm"
    echo "  .zip: Unzip and run the binary"
}

# Main execution
main() {
    log_info "========================================"
    log_info "MCPJam Inspector Linux Packaging"
    log_info "========================================"
    echo ""
    
    # Parse arguments
    SKIP_DEPS=false
    SKIP_BUILD=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-deps    Skip dependency installation"
                echo "  --skip-build   Skip build step (assumes already built)"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Run the packaging process
    check_prerequisites
    echo ""
    
    generate_icon
    echo ""
    
    if [ "$SKIP_DEPS" = false ]; then
        install_deps
        echo ""
    else
        log_info "Skipping dependency installation (--skip-deps)"
        echo ""
    fi
    
    if [ "$SKIP_BUILD" = false ]; then
        build
        echo ""
    else
        log_info "Skipping build step (--skip-build)"
        echo ""
    fi
    
    package_linux
    echo ""
    
    show_output
}

# Run main function
main "$@"