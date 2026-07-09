use super::types::ProcessFingerprint;
use std::collections::HashMap;

type ProcessSnapshot = HashMap<u32, (u32, String, String)>;

pub(super) fn fingerprint_port_process(
    port: u16,
    pids: &[u32],
    all: &ProcessSnapshot,
) -> Option<ProcessFingerprint> {
    pids.iter()
        .filter_map(|pid| {
            let (_, _, command) = all.get(pid)?;
            if command.is_empty() || command == "Unknown" {
                return None;
            }
            fingerprint_by_command(command, port)
        })
        .next()
}

fn fingerprint_by_command(command: &str, port: u16) -> Option<ProcessFingerprint> {
    let cmd_lower = command.to_lowercase();

    let fp = match port {
        3000 => {
            if contains_all(&cmd_lower, &["next", "node"])
                && !contains_any(&cmd_lower, &[".vite", "vite/bin"])
            {
                fp("Node.js", "Next.js Dev Server", "▲")
            } else if contains_all(&cmd_lower, &["vite", "react"])
                || contains_any(
                    &cmd_lower,
                    &["react-scripts", "react-dev-utils", "create-react-app"],
                )
            {
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
        3001 if contains_all(&cmd_lower, &["next", "node"]) => {
            fp("Node.js", "Next.js Dev Server", "▲")
        }
        5173 | 5174 if contains_any(&cmd_lower, &["vite"]) => {
            fp("Node.js", "Vite Dev Server", "⚡")
        }
        4200 if contains_any(&cmd_lower, &["ng ", "angular", "@angular"]) => {
            fp("Node.js", "Angular Dev Server", "🔺")
        }
        5000 => {
            if contains_any(&cmd_lower, &["flask"]) {
                fp("Python", "Flask Dev Server", "🐍")
            } else if contains_any(&cmd_lower, &["gunicorn"]) {
                fp("Python", "Gunicorn (Flask/Django)", "🐍")
            } else if contains_all(&cmd_lower, &["python", "django"])
                || contains_any(&cmd_lower, &["manage.py", "manage-py", "django-admin"])
            {
                fp("Python", "Django Dev Server", "🎸")
            } else if contains_any(&cmd_lower, &["python", "python3"]) {
                fp("Python", "Python Dev Server", "🐍")
            } else {
                return None;
            }
        }
        8000 => {
            if contains_all(&cmd_lower, &["python", "http.server"])
                || contains_all(&cmd_lower, &["python", "-m", "http"])
            {
                fp("Python", "Python HTTP Server", "🐍")
            } else if contains_any(&cmd_lower, &["python", "python3"])
                && contains_any(
                    &cmd_lower,
                    &["serve", "server", "app.py", "app-py", "uvicorn"],
                )
            {
                fp("Python", "Python Web Server", "🐍")
            } else if contains_any(&cmd_lower, &["node"]) {
                fp("Node.js", "Node.js Server", "📦")
            } else {
                return None;
            }
        }
        8080 => {
            if contains_any(&cmd_lower, &["spring", "spring-boot", "springboot"])
                || (contains_all(&cmd_lower, &["java", "jar"])
                    && contains_all(&cmd_lower, &["8080"]))
            {
                fp("Java", "Spring Boot", "🍃")
            } else if contains_all(&cmd_lower, &["java", "tomcat"]) {
                fp("Java", "Apache Tomcat", "☕")
            } else if contains_any(&cmd_lower, &["vue", "vue-cli-service"])
                || (contains_any(&cmd_lower, &["node"]) && contains_all(&cmd_lower, &["8080"]))
            {
                fp("Node.js", "Vue Dev Server", "💚")
            } else if contains_any(
                &cmd_lower,
                &[
                    "docker",
                    "docker-proxy",
                    "containerd",
                    "dockerd",
                    "com.docker",
                ],
            ) {
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
        8888 if contains_any(&cmd_lower, &["jupyter"]) => fp("Python", "Jupyter Notebook", "📓"),
        8443 if contains_any(&cmd_lower, &["java", "tomcat"]) => {
            fp("Java", "Apache Tomcat (SSL)", "☕")
        }
        5432 if contains_any(&cmd_lower, &["postgres", "postgresql"]) => {
            fp("Database", "PostgreSQL", "🐘")
        }
        3306 if contains_any(&cmd_lower, &["mysql", "mysqld", "mariadb"]) => {
            fp("Database", "MySQL / MariaDB", "🐬")
        }
        6379 if contains_any(&cmd_lower, &["redis", "redis-server"]) => {
            fp("Database", "Redis", "🔴")
        }
        27017 if contains_any(&cmd_lower, &["mongod", "mongodb", "mongo"]) => {
            fp("Database", "MongoDB", "🍃")
        }
        9090 if contains_any(&cmd_lower, &["prometheus"]) => fp("Monitoring", "Prometheus", "📊"),
        3005 if contains_any(&cmd_lower, &["livereload", "live-server"]) => {
            fp("Tools", "LiveReload", "🔄")
        }
        9229 | 9230 if contains_any(&cmd_lower, &["node", "chrome", "inspect"]) => {
            fp("Node.js", "Node.js Debugger", "🔍")
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
