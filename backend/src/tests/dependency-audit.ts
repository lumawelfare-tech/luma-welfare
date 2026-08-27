/**
 * LUMA WELFARE — DEPENDENCY VULNERABILITY AUDIT
 *
 * Runs npm audit and produces a structured report with:
 * - Vulnerability counts by severity
 * - Affected packages and paths
 * - Remediation recommendations
 * - Go/no-go deployment decision
 *
 * Run: npx tsx src/tests/dependency-audit.ts
 * Or:  npm run audit:security
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

interface AuditVulnerability {
  name: string
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical'
  isDirect: boolean
  via: Array<string | { title: string; url: string; severity: string }>
  range: string
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean }
}

interface AuditOutput {
  vulnerabilities: Record<string, AuditVulnerability>
  metadata: {
    vulnerabilities: {
      info: number
      low: number
      moderate: number
      high: number
      critical: number
      total: number
    }
    dependencies: {
      prod: number
      dev: number
      optional: number
      peer: number
      peerOptional: number
      total: number
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function runAudit(cwd: string): AuditOutput | null {
  try {
    const result = execSync('npm audit --json 2>/dev/null', {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return JSON.parse(result) as AuditOutput
  } catch (err: unknown) {
    // npm audit exits with code 1 when vulnerabilities found — that's expected
    const error = err as { stdout?: string; status?: number }
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout) as AuditOutput
      } catch {
        return null
      }
    }
    return null
  }
}

function formatSeverity(severity: string): string {
  const icons: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    moderate: '🟡',
    low: '🔵',
    info: '⚪',
  }
  return `${icons[severity] ?? '⚪'} ${severity.toUpperCase()}`
}

// ============================================================================
// MAIN AUDIT
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  LUMA WELFARE — DEPENDENCY VULNERABILITY AUDIT')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Date: ${new Date().toISOString()}`)
  console.log('')

  const projectRoot = join(__dirname, '..', '..')
  const frontendDir = join(projectRoot, 'frontend')
  const backendDir = join(projectRoot, 'backend')

  const results: Array<{ name: string; audit: AuditOutput | null }> = []

  // Audit each workspace
  for (const [name, dir] of [
    ['Root', projectRoot],
    ['Frontend', frontendDir],
    ['Backend', backendDir],
  ]) {
    if (!existsSync(join(dir, 'package.json'))) continue

    console.log(`\n📦 Auditing ${name}...`)
    const audit = runAudit(dir)
    results.push({ name, audit })
  }

  // Aggregate results
  let totalCritical = 0
  let totalHigh = 0
  let totalModerate = 0
  let totalLow = 0
  let totalInfo = 0
  let totalDeps = 0

  const criticalVulns: Array<{ pkg: string; vuln: AuditVulnerability }> = []
  const highVulns: Array<{ pkg: string; vuln: AuditVulnerability }> = []

  for (const { name, audit } of results) {
    if (!audit) {
      console.log(`  ⚠️  Could not audit ${name}`)
      continue
    }

    const v = audit.metadata.vulnerabilities
    const d = audit.metadata.dependencies

    totalCritical += v.critical
    totalHigh += v.high
    totalModerate += v.moderate
    totalLow += v.low
    totalInfo += v.info
    totalDeps += d.total

    console.log(`  ${name}: ${v.total} vulnerabilities in ${d.total} dependencies`)
    console.log(`    Critical: ${v.critical} | High: ${v.high} | Moderate: ${v.moderate} | Low: ${v.low}`)

    // Collect critical and high vulnerabilities
    for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities)) {
      if (vuln.severity === 'critical') {
        criticalVulns.push({ pkg: pkgName, vuln })
      } else if (vuln.severity === 'high') {
        highVulns.push({ pkg: pkgName, vuln })
      }
    }
  }

  // Summary
  const totalVulns = totalCritical + totalHigh + totalModerate + totalLow + totalInfo

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Total dependencies: ${totalDeps}`)
  console.log(`  Total vulnerabilities: ${totalVulns}`)
  console.log('')
  console.log(`  ${formatSeverity('critical')}: ${totalCritical}`)
  console.log(`  ${formatSeverity('high')}: ${totalHigh}`)
  console.log(`  ${formatSeverity('moderate')}: ${totalModerate}`)
  console.log(`  ${formatSeverity('low')}: ${totalLow}`)
  console.log(`  ${formatSeverity('info')}: ${totalInfo}`)

  // Critical vulnerabilities detail
  if (criticalVulns.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('  🔴 CRITICAL VULNERABILITIES')
    console.log('═══════════════════════════════════════════════════════════════')
    for (const { pkg, vuln } of criticalVulns) {
      console.log(`\n  Package: ${pkg}`)
      console.log(`  Range: ${vuln.range}`)
      console.log(`  Direct dependency: ${vuln.isDirect ? 'Yes' : 'No'}`)
      if (typeof vuln.fixAvailable === 'object' && vuln.fixAvailable) {
        console.log(`  Fix: npm install ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`)
      } else if (vuln.fixAvailable) {
        console.log('  Fix: Run npm audit fix')
      } else {
        console.log('  Fix: No automatic fix available — manual review required')
      }
    }
  }

  // High vulnerabilities detail
  if (highVulns.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('  🟠 HIGH VULNERABILITIES')
    console.log('═══════════════════════════════════════════════════════════════')
    for (const { pkg, vuln } of highVulns) {
      console.log(`\n  Package: ${pkg}`)
      console.log(`  Range: ${vuln.range}`)
      console.log(`  Direct dependency: ${vuln.isDirect ? 'Yes' : 'No'}`)
      if (typeof vuln.fixAvailable === 'object' && vuln.fixAvailable) {
        const semverMajor = vuln.fixAvailable.isSemVerMajor ? ' (SEMVER MAJOR — may break)' : ''
        console.log(`  Fix: npm install ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}${semverMajor}`)
      } else if (vuln.fixAvailable) {
        console.log('  Fix: Run npm audit fix')
      } else {
        console.log('  Fix: No automatic fix available')
      }
    }
  }

  // Deployment decision
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  DEPLOYMENT DECISION')
  console.log('═══════════════════════════════════════════════════════════════')

  if (totalCritical > 0) {
    console.log('  ❌ BLOCKED — Critical vulnerabilities must be fixed before deployment')
    console.log('')
    console.log('  Actions required:')
    console.log('  1. Review each critical vulnerability above')
    console.log('  2. Apply available fixes: npm audit fix')
    console.log('  3. For unfixed vulnerabilities: assess risk and document decision')
    console.log('  4. Re-run audit to verify fixes')
    process.exit(1)
  }

  if (totalHigh > 5) {
    console.log('  ⚠️  WARNING — Multiple high vulnerabilities')
    console.log('  Consider fixing before production deployment')
    console.log('  Review the vulnerabilities above and apply available fixes')
  } else if (totalHigh > 0) {
    console.log('  ⚠️  INFO — Some high vulnerabilities exist')
    console.log('  Review and document decisions for each')
  }

  if (totalVulns === 0) {
    console.log('  ✅ NO VULNERABILITIES — Safe to deploy')
  } else if (totalCritical === 0 && totalHigh <= 5) {
    console.log('  ✅ PASS — No critical vulnerabilities, acceptable risk level')
  }

  // Write report
  const reportPath = join(projectRoot, 'docs', 'SECURITY_AUDIT_REPORT.md')
  const report = `# Security Audit Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Count |
|--------|------:|
| Total Dependencies | ${totalDeps} |
| Total Vulnerabilities | ${totalVulns} |
| Critical | ${totalCritical} |
| High | ${totalHigh} |
| Moderate | ${totalModerate} |
| Low | ${totalLow} |
| Info | ${totalInfo} |

## Deployment Decision

${totalCritical > 0 ? '❌ **BLOCKED** — Critical vulnerabilities must be fixed' : '✅ **PASS** — Safe to deploy'}

## Critical Vulnerabilities

${criticalVulns.length > 0 ? criticalVulns.map(({ pkg, vuln }) => `- **${pkg}** (${vuln.range}) — ${vuln.isDirect ? 'Direct' : 'Transitive'} dependency`).join('\n') : 'None'}

## High Vulnerabilities

${highVulns.length > 0 ? highVulns.map(({ pkg, vuln }) => `- **${pkg}** (${vuln.range}) — ${vuln.isDirect ? 'Direct' : 'Transitive'} dependency`).join('\n') : 'None'}

## Remediation

\`\`\`bash
# Auto-fix where possible
npm audit fix

# Force fix (may introduce breaking changes)
npm audit fix --force

# Manual review for unfixed vulnerabilities
npm audit
\`\`\`
`

  writeFileSync(reportPath, report)
  console.log(`\n  Report saved to: docs/SECURITY_AUDIT_REPORT.md`)
}

main().catch(console.error)
