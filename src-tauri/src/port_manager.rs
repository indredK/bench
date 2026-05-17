use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;
use sysinfo::System;

#[derive(Debug, Serialize)]
pub struct KillPidResult {
    pub pid: u32,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub hostname: String,
    pub cpu_brand: String,
    pub cpu_cores: u32,
    pub total_memory: u64,
    pub available_memory: u64,
    pub used_memory: u64,
    pub memory_usage_percent: f32,
}

#[derive(Debug, Serialize)]
pub struct ProcessNode {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub command: String,
    pub children: Vec<ProcessNode>,
}

#[derive(Debug, Serialize)]
pub struct ProcessFingerprint {
    pub category: String,
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Serialize)]
pub struct PortProcessDetail {
    pub port: u16,
    pub pids: Vec<u32>,
    pub process_trees: Vec<ProcessNode>,
    pub fingerprint: Option<ProcessFingerprint>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn query_port_processes(ports: Vec<u16>) -> Vec<PortProcessDetail> {
    let all_processes = get_all_processes();

    ports
        .into_iter()
        .map(|port| {
            let pids = match find_pids_by_port(port) {
                Ok(pids) => pids,
                Err(e) => {
                    return PortProcessDetail {
                        port,
                        pids: vec![],
                        process_trees: vec![],
                        fingerprint: None,
                        error: Some(format!("Failed to query: {}", e)),
                    };
                }
            };

            if pids.is_empty() {
                return PortProcessDetail {
                    port,
                    pids: vec![],
                    process_trees: vec![],
                    fingerprint: None,
                    error: Some("No process found on this port".to_string()),
                };
            }

            let process_trees: Vec<ProcessNode> = pids
                .iter()
                .map(|pid| build_focused_tree(*pid, &all_processes))
                .collect();

            let fingerprint = fingerprint_port_process(port, &pids, &all_processes);

            PortProcessDetail {
                port,
                pids,
                process_trees,
                fingerprint,
                error: None,
            }
        })
        .collect()
}

#[tauri::command]
pub fn kill_processes(pids: Vec<u32>) -> Vec<KillPidResult> {
    let all_processes = get_all_processes();
    pids.into_iter()
        .map(|pid| match kill_process(pid, &all_processes) {
            Ok(()) => KillPidResult {
                pid,
                success: true,
                message: "Successfully terminated".to_string(),
            },
            Err(e) => KillPidResult {
                pid,
                success: false,
                message: e,
            },
        })
        .collect()
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_memory = sys.total_memory();
    let available_memory = sys.available_memory();
    let used_memory = total_memory - available_memory;
    let memory_usage_percent = if total_memory > 0 {
        (used_memory as f32 / total_memory as f32) * 100.0
    } else {
        0.0
    };

    SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::long_os_version().unwrap_or_else(|| "Unknown".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_string()),
        hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        cpu_brand: sys.cpus().first().map(|cpu| cpu.brand().to_string()).unwrap_or_else(|| "Unknown".to_string()),
        cpu_cores: sys.cpus().len() as u32,
        total_memory,
        available_memory,
        used_memory,
        memory_usage_percent,
    }
}

fn kill_process(pid: u32, all_processes: &HashMap<u32, (u32, String, String)>) -> Result<(), String> {
    let current_pid = std::process::id();
    if pid == current_pid {
        return Err("Cannot kill the Port Manager process itself".to_string());
    }
    if is_descendant_of(pid, current_pid, all_processes) {
        return Err("Cannot kill a child process of Port Manager".to_string());
    }

    if cfg!(target_os = "windows") {
        let output = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map_err(|e| format!("Failed to run taskkill: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("taskkill error: {}", stderr.trim()))
        }
    } else {
        let output = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to run kill: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("kill error: {}", stderr.trim()))
        }
    }
}

fn is_descendant_of(pid: u32, parent_pid: u32, all_processes: &HashMap<u32, (u32, String, String)>) -> bool {
    let mut current = pid;
    loop {
        if let Some(&(ppid, _, _)) = all_processes.get(&current) {
            if ppid == parent_pid {
                return true;
            }
            if ppid == 0 || ppid == 1 || ppid == current {
                return false;
            }
            current = ppid;
        } else {
            return false;
        }
    }
}

fn find_pids_by_port(port: u16) -> Result<Vec<u32>, String> {
    if cfg!(target_os = "windows") {
        find_pids_by_port_windows(port)
    } else {
        find_pids_by_port_unix(port)
    }
}

fn find_pids_by_port_unix(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
        .map_err(|e| format!("Failed to run lsof: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    let pids: Result<Vec<u32>, _> = stdout
        .lines()
        .map(|line| {
            line.trim()
                .parse::<u32>()
                .map_err(|e| format!("Failed to parse PID '{}': {}", line.trim(), e))
        })
        .collect();

    pids
}

fn find_pids_by_port_windows(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| format!("Failed to run netstat: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = format!(":{}", port);

    let mut pids: Vec<u32> = Vec::new();

    for line in stdout.lines() {
        if line.contains(&port_str) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(pid_str) = parts.last() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    if pid != 0 && !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }
    }

    Ok(pids)
}

fn get_all_processes() -> HashMap<u32, (u32, String, String)> {
    let mut processes = HashMap::new();

    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Csv -NoTypeInformation"
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let line = line.trim();
                if line.is_empty() || !line.starts_with('"') {
                    continue;
                }
                let parts: Vec<&str> = line.split(',')
                    .map(|s| s.trim_matches('"').trim())
                    .collect();
                if parts.len() >= 4 {
                    if let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                        let name = parts[2].to_string();
                        let cmd = parts[3..].join(",");
                        processes.insert(pid, (ppid, name, cmd));
                    }
                }
            }
        }
    } else {
        if let Ok(output) = Command::new("ps").args(["-eo", "pid,ppid,comm,args"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    if let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                        let command = parts[3..].join(" ");
                        processes.insert(pid, (ppid, parts[2].to_string(), command));
                    }
                }
            }
        }
    }

    processes
}

fn build_subtree(pid: u32, all: &HashMap<u32, (u32, String, String)>) -> ProcessNode {
    let (ppid, name, command) = all.get(&pid).cloned().unwrap_or((0, "Unknown".to_string(), "Unknown".to_string()));

    let mut children: Vec<ProcessNode> = all
        .iter()
        .filter(|(&child_pid, child_info)| child_info.0 == pid && child_pid != pid)
        .map(|(&child_pid, _)| build_subtree(child_pid, all))
        .collect();

    children.sort_by_key(|c| c.pid);

    ProcessNode {
        pid,
        ppid,
        name,
        command,
        children,
    }
}

fn get_parent_chain(pid: u32, all: &HashMap<u32, (u32, String, String)>, max_depth: usize) -> Vec<u32> {
    let mut chain = Vec::new();
    let mut current = pid;
    for _ in 0..max_depth {
        if let Some(&(ppid, _, _)) = all.get(&current) {
            if ppid == 0 || ppid == current || ppid == 1 || chain.contains(&ppid) {
                break;
            }
            chain.push(ppid);
            current = ppid;
        } else {
            break;
        }
    }
    chain
}

fn build_focused_tree(pid: u32, all: &HashMap<u32, (u32, String, String)>) -> ProcessNode {
    let parent_chain = get_parent_chain(pid, all, 10);
    let root_pid = parent_chain.last().copied().unwrap_or(pid);
    build_subtree(root_pid, all)
}

fn fingerprint_port_process(port: u16, pids: &[u32], all: &HashMap<u32, (u32, String, String)>) -> Option<ProcessFingerprint> {
    if pids.is_empty() {
        return None;
    }

    let pid = pids[0];
    let (_, _, command) = all.get(&pid).cloned().unwrap_or((0, String::new(), String::new()));

    if command.is_empty() || command == "Unknown" {
        return None;
    }

    fingerprint_by_command(&command, port)
}

fn fingerprint_by_command(command: &str, port: u16) -> Option<ProcessFingerprint> {
    let cmd_lower = command.to_lowercase();

    let fp = match port {
        3000 => {
            if contains_all(&cmd_lower, &["next", "node"]) && !contains_any(&cmd_lower, &[".vite", "vite/bin"]) {
                fp("Node.js", "Next.js Dev Server", "▲")
            } else if contains_all(&cmd_lower, &["vite", "react"]) || contains_any(&cmd_lower, &["react-scripts", "react-dev-utils", "create-react-app"]) {
                fp("Node.js", "React Dev Server (Vite)", "⚛️")
            } else if contains_any(&cmd_lower, &["vite"]) {
                fp("Node.js", "Vite Dev Server", "⚡")
            } else if contains_any(&cmd_lower, &["nuxt"]) {
                fp("Node.js", "Nuxt Dev Server", "🟢")
            } else if contains_any(&cmd_lower, &["gatsby"]) {
                fp("Node.js", "Gatsby Dev Server", "🏗️")
            } else if contains_any(&cmd_lower, &["remix"]) {
                fp("Node.js", "Remix Dev Server", "💿")
            } else if contains_any(&cmd_lower, &["svelte", "svelte-kit"]) {
                fp("Node.js", "Svelte Dev Server", "🧡")
            } else if contains_any(&cmd_lower, &["next"]) {
                fp("Node.js", "Next.js Dev Server", "▲")
            } else if contains_any(&cmd_lower, &["webpack", "webpack-dev-server"]) {
                fp("Node.js", "Webpack Dev Server", "📦")
            } else {
                return None;
            }
        }
        3001 => {
            if contains_all(&cmd_lower, &["next", "node"]) {
                fp("Node.js", "Next.js Dev Server", "▲")
            } else {
                return None;
            }
        }
        5173 | 5174 => {
            if contains_any(&cmd_lower, &["vite"]) {
                fp("Node.js", "Vite Dev Server", "⚡")
            } else {
                return None;
            }
        }
        4200 => {
            if contains_any(&cmd_lower, &["ng ", "angular", "@angular"]) {
                fp("Node.js", "Angular Dev Server", "🔺")
            } else {
                return None;
            }
        }
        5000 => {
            if contains_any(&cmd_lower, &["flask"]) {
                fp("Python", "Flask Dev Server", "🐍")
            } else if contains_any(&cmd_lower, &["gunicorn"]) {
                fp("Python", "Gunicorn (Flask/Django)", "🐍")
            } else if contains_all(&cmd_lower, &["python", "django"]) || contains_any(&cmd_lower, &["manage.py", "manage-py", "django-admin"]) {
                fp("Python", "Django Dev Server", "🎸")
            } else if contains_any(&cmd_lower, &["python", "python3"]) {
                fp("Python", "Python Dev Server", "🐍")
            } else {
                return None;
            }
        }
        8000 => {
            if contains_all(&cmd_lower, &["python", "http.server"]) || contains_all(&cmd_lower, &["python", "-m", "http"]) {
                fp("Python", "Python HTTP Server", "🐍")
            } else if contains_any(&cmd_lower, &["python", "python3"]) && contains_any(&cmd_lower, &["serve", "server", "app.py", "app-py", "uvicorn"]) {
                fp("Python", "Python Web Server", "🐍")
            } else if contains_any(&cmd_lower, &["node"]) {
                fp("Node.js", "Node.js Server", "📦")
            } else {
                return None;
            }
        }
        8080 => {
            if contains_any(&cmd_lower, &["spring", "spring-boot", "springboot"]) || (contains_all(&cmd_lower, &["java", "jar"]) && contains_all(&cmd_lower, &["8080"])) {
                fp("Java", "Spring Boot", "🍃")
            } else if contains_all(&cmd_lower, &["java", "tomcat"]) {
                fp("Java", "Apache Tomcat", "☕")
            } else if contains_any(&cmd_lower, &["vue", "vue-cli-service"]) || (contains_any(&cmd_lower, &["node"]) && contains_all(&cmd_lower, &["8080"])) {
                fp("Node.js", "Vue Dev Server", "💚")
            } else if contains_any(&cmd_lower, &["docker", "docker-proxy", "containerd", "dockerd", "com.docker"]) {
                fp("Container", "Docker Container", "🐳")
            } else if contains_all(&cmd_lower, &["java", "jar"]) {
                fp("Java", "Java Application", "☕")
            } else if contains_any(&cmd_lower, &["jenkins"]) {
                fp("Java", "Jenkins CI", "🔧")
            } else if contains_any(&cmd_lower, &["npx", "node"]) {
                fp("Node.js", "Node.js Dev Server", "📦")
            } else if contains_any(&cmd_lower, &["grails"]) {
                fp("Java", "Grails", "🌱")
            } else {
                return None;
            }
        }
        8888 => {
            if contains_any(&cmd_lower, &["jupyter"]) {
                fp("Python", "Jupyter Notebook", "📓")
            } else {
                return None;
            }
        }
        8443 => {
            if contains_any(&cmd_lower, &["java", "tomcat"]) {
                fp("Java", "Apache Tomcat (SSL)", "☕")
            } else {
                return None;
            }
        }
        5432 => {
            if contains_any(&cmd_lower, &["postgres", "postgresql"]) {
                fp("Database", "PostgreSQL", "🐘")
            } else {
                return None;
            }
        }
        3306 => {
            if contains_any(&cmd_lower, &["mysql", "mysqld", "mariadb"]) {
                fp("Database", "MySQL / MariaDB", "🐬")
            } else {
                return None;
            }
        }
        6379 => {
            if contains_any(&cmd_lower, &["redis", "redis-server"]) {
                fp("Database", "Redis", "🔴")
            } else {
                return None;
            }
        }
        27017 => {
            if contains_any(&cmd_lower, &["mongod", "mongodb", "mongo"]) {
                fp("Database", "MongoDB", "🍃")
            } else {
                return None;
            }
        }
        9090 => {
            if contains_any(&cmd_lower, &["prometheus"]) {
                fp("Monitoring", "Prometheus", "📊")
            } else {
                return None;
            }
        }
        3005 => {
            if contains_any(&cmd_lower, &["livereload", "live-server"]) {
                fp("Tools", "LiveReload", "🔄")
            } else {
                return None;
            }
        }
        9229 | 9230 => {
            if contains_any(&cmd_lower, &["node", "chrome", "inspect"]) {
                fp("Node.js", "Node.js Debugger", "🔍")
            } else {
                return None;
            }
        }
        _ => return None,
    };

    Some(fp)
}

fn fp(category: &str, name: &str, icon: &str) -> ProcessFingerprint {
    ProcessFingerprint {
        category: category.to_string(),
        name: name.to_string(),
        icon: icon.to_string(),
    }
}

fn contains_all(text: &str, patterns: &[&str]) -> bool {
    patterns.iter().all(|p| text.contains(p))
}

fn contains_any(text: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|p| text.contains(p))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_contains_all() {
        assert!(contains_all("hello world foo bar", &["hello", "world"]));
        assert!(!contains_all("hello world", &["hello", "missing"]));
        assert!(contains_all("test", &[]));
    }

    #[test]
    fn test_contains_any() {
        assert!(contains_any("hello world", &["hello", "missing"]));
        assert!(!contains_any("hello world", &["missing", "absent"]));
        assert!(!contains_any("test", &[]));
    }

    #[test]
    fn test_fingerprint_by_command_vite() {
        let fp = fingerprint_by_command("node /path/vite/bin/vite.js", 5173);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Node.js");
        assert!(fp.name.contains("Vite"));
    }

    #[test]
    fn test_fingerprint_by_command_nextjs() {
        let fp = fingerprint_by_command("next dev --port 3000", 3000);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Node.js");
        assert!(fp.name.contains("Next.js"));
    }

    #[test]
    fn test_fingerprint_by_command_flask() {
        let fp = fingerprint_by_command("python -m flask run", 5000);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Python");
        assert!(fp.name.contains("Flask"));
    }

    #[test]
    fn test_fingerprint_by_command_postgres() {
        let fp = fingerprint_by_command("/usr/lib/postgresql/14/bin/postgres", 5432);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Database");
        assert!(fp.name.contains("PostgreSQL"));
    }

    #[test]
    fn test_fingerprint_by_command_redis() {
        let fp = fingerprint_by_command("redis-server *:6379", 6379);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Database");
        assert!(fp.name.contains("Redis"));
    }

    #[test]
    fn test_fingerprint_by_command_mysql() {
        let fp = fingerprint_by_command("/usr/sbin/mysqld", 3306);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Database");
        assert!(fp.name.contains("MySQL"));
    }

    #[test]
    fn test_fingerprint_by_command_mongodb() {
        let fp = fingerprint_by_command("/usr/bin/mongod --port 27017", 27017);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Database");
        assert!(fp.name.contains("MongoDB"));
    }

    #[test]
    fn test_fingerprint_by_command_spring_boot() {
        let fp = fingerprint_by_command("java -jar app.jar --server.port=8080", 8080);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Java");
        assert!(fp.name.contains("Spring Boot"));
    }

    #[test]
    fn test_fingerprint_by_command_jupyter() {
        let fp = fingerprint_by_command("jupyter-notebook", 8888);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Python");
        assert!(fp.name.contains("Jupyter"));
    }

    #[test]
    fn test_fingerprint_by_command_prometheus() {
        let fp = fingerprint_by_command("/bin/prometheus --config.file=prometheus.yml", 9090);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Monitoring");
        assert!(fp.name.contains("Prometheus"));
    }

    #[test]
    fn test_fingerprint_by_command_node_debugger() {
        let fp = fingerprint_by_command("node --inspect index.js", 9229);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Node.js");
        assert!(fp.name.contains("Debugger"));
    }

    #[test]
    fn test_fingerprint_by_command_unknown_port() {
        let fp = fingerprint_by_command("some-random-app", 9999);
        assert!(fp.is_none());
    }

    #[test]
    fn test_fingerprint_by_command_empty() {
        let fp = fingerprint_by_command("", 3000);
        assert!(fp.is_none());
    }

    #[test]
    fn test_fingerprint_by_command_angular() {
        let fp = fingerprint_by_command("ng serve", 4200);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Node.js");
        assert!(fp.name.contains("Angular"));
    }

    #[test]
    fn test_fingerprint_by_command_django() {
        let fp = fingerprint_by_command("python manage.py runserver", 5000);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Python");
        assert!(fp.name.contains("Django"));
    }

    #[test]
    fn test_fingerprint_by_command_python_http() {
        let fp = fingerprint_by_command("python -m http.server 8000", 8000);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Python");
        assert!(fp.name.contains("HTTP Server"));
    }

    #[test]
    fn test_fingerprint_by_command_docker_8080() {
        let fp = fingerprint_by_command("docker-proxy -proto tcp", 8080);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Container");
        assert!(fp.name.contains("Docker"));
    }

    #[test]
    fn test_fingerprint_by_command_tomcat_ssl() {
        let fp = fingerprint_by_command("java org.apache.catalina.startup.Bootstrap", 8443);
        assert!(fp.is_some());
        let fp = fp.unwrap();
        assert_eq!(fp.category, "Java");
        assert!(fp.name.contains("Tomcat"));
    }

    #[test]
    fn test_is_descendant_of_direct_child() {
        let mut processes = HashMap::new();
        processes.insert(100, (50, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(50, (1, "grandparent".to_string(), "/sbin/init".to_string()));

        assert!(is_descendant_of(100, 50, &processes));
    }

    #[test]
    fn test_is_descendant_of_grandchild() {
        let mut processes = HashMap::new();
        processes.insert(200, (100, "child".to_string(), "/bin/child".to_string()));
        processes.insert(100, (50, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(50, (1, "init".to_string(), "/sbin/init".to_string()));

        assert!(is_descendant_of(200, 50, &processes));
    }

    #[test]
    fn test_is_descendant_of_not_related() {
        let mut processes = HashMap::new();
        processes.insert(100, (50, "a".to_string(), "/bin/a".to_string()));
        processes.insert(200, (150, "b".to_string(), "/bin/b".to_string()));

        assert!(!is_descendant_of(100, 200, &processes));
    }

    #[test]
    fn test_is_descendant_of_self() {
        let mut processes = HashMap::new();
        processes.insert(100, (50, "self".to_string(), "/bin/self".to_string()));

        assert!(!is_descendant_of(100, 100, &processes));
    }

    #[test]
    fn test_is_descendant_of_missing_pid() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        assert!(!is_descendant_of(999, 1, &processes));
    }

    #[test]
    fn test_is_descendant_of_root_process() {
        let mut processes = HashMap::new();
        processes.insert(100, (0, "orphan".to_string(), "/bin/orphan".to_string()));

        assert!(!is_descendant_of(100, 1, &processes));
    }

    #[test]
    fn test_build_subtree_single_node() {
        let mut processes = HashMap::new();
        processes.insert(42, (1, "myapp".to_string(), "/usr/bin/myapp".to_string()));

        let node = build_subtree(42, &processes);
        assert_eq!(node.pid, 42);
        assert_eq!(node.ppid, 1);
        assert_eq!(node.name, "myapp");
        assert_eq!(node.command, "/usr/bin/myapp");
        assert!(node.children.is_empty());
    }

    #[test]
    fn test_build_subtree_with_children() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));
        processes.insert(100, (1, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(101, (100, "child1".to_string(), "/bin/child1".to_string()));
        processes.insert(102, (100, "child2".to_string(), "/bin/child2".to_string()));

        let node = build_subtree(1, &processes);
        assert_eq!(node.pid, 1);
        assert_eq!(node.children.len(), 1);

        let parent = &node.children[0];
        assert_eq!(parent.pid, 100);
        assert_eq!(parent.children.len(), 2);
        assert_eq!(parent.children[0].pid, 101);
        assert_eq!(parent.children[1].pid, 102);
    }

    #[test]
    fn test_build_subtree_missing_pid() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        let node = build_subtree(999, &processes);
        assert_eq!(node.pid, 999);
        assert_eq!(node.name, "Unknown");
        assert!(node.children.is_empty());
    }

    #[test]
    fn test_get_parent_chain_normal() {
        let mut processes = HashMap::new();
        processes.insert(200, (100, "child".to_string(), "/bin/child".to_string()));
        processes.insert(100, (50, "parent".to_string(), "/bin/parent".to_string()));
        processes.insert(50, (1, "grandparent".to_string(), "/sbin/init".to_string()));

        let chain = get_parent_chain(200, &processes, 10);
        assert_eq!(chain, vec![100, 50]);
    }

    #[test]
    fn test_get_parent_chain_max_depth() {
        let mut processes = HashMap::new();
        processes.insert(5, (4, "p5".to_string(), "/bin/p5".to_string()));
        processes.insert(4, (3, "p4".to_string(), "/bin/p4".to_string()));
        processes.insert(3, (2, "p3".to_string(), "/bin/p3".to_string()));
        processes.insert(2, (1, "p2".to_string(), "/bin/p2".to_string()));
        processes.insert(1, (0, "p1".to_string(), "/bin/p1".to_string()));

        let chain = get_parent_chain(5, &processes, 2);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain, vec![4, 3]);
    }

    #[test]
    fn test_get_parent_chain_missing() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        let chain = get_parent_chain(999, &processes, 10);
        assert!(chain.is_empty());
    }

    #[test]
    fn test_get_parent_chain_circular_prevention() {
        let mut processes = HashMap::new();
        processes.insert(100, (200, "a".to_string(), "/bin/a".to_string()));
        processes.insert(200, (100, "b".to_string(), "/bin/b".to_string()));

        let chain = get_parent_chain(100, &processes, 10);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0], 200);
        assert_eq!(chain[1], 100);
    }

    #[test]
    fn test_build_focused_tree_finds_root() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));
        processes.insert(50, (1, "service".to_string(), "/bin/service".to_string()));
        processes.insert(100, (50, "worker".to_string(), "/bin/worker".to_string()));

        let node = build_focused_tree(100, &processes);
        assert_eq!(node.pid, 50);
        assert_eq!(node.children.len(), 1);
        assert_eq!(node.children[0].pid, 100);
    }

    #[test]
    fn test_build_focused_tree_already_root() {
        let mut processes = HashMap::new();
        processes.insert(1, (0, "init".to_string(), "/sbin/init".to_string()));

        let node = build_focused_tree(1, &processes);
        assert_eq!(node.pid, 1);
    }

    #[test]
    fn test_fingerprint_port_process_empty_pids() {
        let processes: HashMap<u32, (u32, String, String)> = HashMap::new();
        let result = fingerprint_port_process(3000, &[], &processes);
        assert!(result.is_none());
    }

    #[test]
    fn test_fingerprint_port_process_unknown_command() {
        let mut processes = HashMap::new();
        processes.insert(100, (1, "unknown".to_string(), "Unknown".to_string()));
        let result = fingerprint_port_process(3000, &[100], &processes);
        assert!(result.is_none());
    }

    #[test]
    fn test_fingerprint_port_process_known_command() {
        let mut processes = HashMap::new();
        processes.insert(100, (1, "node".to_string(), "next dev".to_string()));
        let result = fingerprint_port_process(3000, &[100], &processes);
        assert!(result.is_some());
        let fp = result.unwrap();
        assert!(fp.name.contains("Next.js"));
    }

    #[test]
    fn test_fp_helper() {
        let result = fp("TestCategory", "TestName", "T");
        assert_eq!(result.category, "TestCategory");
        assert_eq!(result.name, "TestName");
        assert_eq!(result.icon, "T");
    }
}
